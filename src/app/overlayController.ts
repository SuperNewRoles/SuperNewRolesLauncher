const BODY_LOCK_CLASS = "settings-overlay-open";
const FOCUSABLE_ELEMENT_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export interface OverlayTimers {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
}

export interface CreateOverlayControllerOptions<TOverlay extends HTMLElement = HTMLDivElement> {
  overlays: Iterable<TOverlay>;
  transitionMs: number;
  document?: Document;
  timers?: OverlayTimers;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
}

export interface OverlayController<TOverlay extends HTMLElement = HTMLDivElement> {
  open(overlay: TOverlay): void;
  close(overlay: TOverlay, immediate?: boolean): void;
  /** Closing transitions remain open until the element is actually hidden. */
  isOpen(overlay: TOverlay): boolean;
  syncBodyLock(): void;
  dispose(): void;
}

function defaultTimers(targetDocument: Document): OverlayTimers {
  const view = targetDocument.defaultView;
  if (!view) {
    throw new Error("A document with defaultView or explicit timers is required");
  }
  return {
    setTimeout: (callback, delay) => view.setTimeout(callback, delay),
    clearTimeout: (handle) => view.clearTimeout(handle),
  };
}

function defaultRequestAnimationFrame(
  targetDocument: Document,
): (callback: FrameRequestCallback) => number {
  const view = targetDocument.defaultView;
  if (view?.requestAnimationFrame) {
    return view.requestAnimationFrame.bind(view);
  }

  // Non-visual DOM implementations do not always expose requestAnimationFrame.
  // Running immediately keeps the state deterministic without creating an
  // untracked fallback timer that could outlive dispose().
  return (callback) => {
    callback(0);
    return 0;
  };
}

export function createOverlayController<TOverlay extends HTMLElement = HTMLDivElement>({
  overlays: overlaySource,
  transitionMs,
  document: targetDocument = document,
  timers: suppliedTimers,
  requestAnimationFrame: suppliedRequestAnimationFrame,
}: CreateOverlayControllerOptions<TOverlay>): OverlayController<TOverlay> {
  if (!Number.isFinite(transitionMs) || transitionMs < 0) {
    throw new RangeError("transitionMs must be a finite, non-negative number");
  }

  const overlays = [...new Set(overlaySource)];
  const managedOverlays = new Set(overlays);
  const timers = suppliedTimers ?? defaultTimers(targetDocument);
  const scheduleFrame =
    suppliedRequestAnimationFrame ?? defaultRequestAnimationFrame(targetDocument);
  const animationTimers = new Map<TOverlay, number>();
  const closeTimers = new Map<TOverlay, number>();
  const generations = new Map<TOverlay, number>();
  let disposed = false;

  function assertManaged(overlay: TOverlay): void {
    if (!managedOverlays.has(overlay)) {
      throw new Error("Overlay is not managed by this controller");
    }
    if (disposed) {
      throw new Error("Overlay controller has been disposed");
    }
  }

  function clearTimer(timerMap: Map<TOverlay, number>, overlay: TOverlay): void {
    const timer = timerMap.get(overlay);
    if (timer === undefined) {
      return;
    }
    timers.clearTimeout(timer);
    timerMap.delete(overlay);
  }

  function nextGeneration(overlay: TOverlay): number {
    const generation = (generations.get(overlay) ?? 0) + 1;
    generations.set(overlay, generation);
    return generation;
  }

  function syncBodyLock(): void {
    const hasVisibleOverlay = !disposed && overlays.some((overlay) => !overlay.hidden);
    targetDocument.documentElement.classList.toggle(BODY_LOCK_CLASS, hasVisibleOverlay);
    targetDocument.body.classList.toggle(BODY_LOCK_CLASS, hasVisibleOverlay);
  }

  function open(overlay: TOverlay): void {
    assertManaged(overlay);
    clearTimer(animationTimers, overlay);
    clearTimer(closeTimers, overlay);
    const generation = nextGeneration(overlay);

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.remove("is-closing");
    overlay.classList.add("is-animating");
    syncBodyLock();

    scheduleFrame(() => {
      if (
        disposed ||
        generations.get(overlay) !== generation ||
        overlay.hidden ||
        overlay.classList.contains("is-closing")
      ) {
        return;
      }
      overlay.classList.add("is-open");
    });

    const timer = timers.setTimeout(() => {
      if (disposed || generations.get(overlay) !== generation) {
        return;
      }
      animationTimers.delete(overlay);
      overlay.classList.remove("is-animating");
    }, transitionMs);
    animationTimers.set(overlay, timer);
  }

  function close(overlay: TOverlay, immediate = false): void {
    assertManaged(overlay);
    clearTimer(animationTimers, overlay);
    clearTimer(closeTimers, overlay);
    const generation = nextGeneration(overlay);

    if (immediate || overlay.hidden) {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.classList.remove("is-open", "is-closing", "is-animating");
      syncBodyLock();
      return;
    }

    overlay.classList.remove("is-open");
    overlay.classList.add("is-closing", "is-animating");

    const timer = timers.setTimeout(() => {
      if (disposed || generations.get(overlay) !== generation) {
        return;
      }
      closeTimers.delete(overlay);
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.classList.remove("is-closing", "is-animating");
      syncBodyLock();
    }, transitionMs);
    closeTimers.set(overlay, timer);
    syncBodyLock();
  }

  function isOpen(overlay: TOverlay): boolean {
    assertManaged(overlay);
    return !overlay.hidden;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;

    for (const overlay of overlays) {
      clearTimer(animationTimers, overlay);
      clearTimer(closeTimers, overlay);
      nextGeneration(overlay);
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.classList.remove("is-open", "is-closing", "is-animating");
    }

    targetDocument.documentElement.classList.remove(BODY_LOCK_CLASS);
    targetDocument.body.classList.remove(BODY_LOCK_CLASS);
  }

  return { open, close, isOpen, syncBodyLock, dispose };
}

export type ConfirmationInitialFocus = HTMLElement | (() => HTMLElement | null | undefined) | null;

export interface ConfirmationRequestOptions {
  beforeOpen?: () => void;
  initialFocus?: ConfirmationInitialFocus;
}

export interface CreateConfirmationControllerOptions<TOverlay extends HTMLElement = HTMLDivElement>
  extends ConfirmationRequestOptions {
  overlay: TOverlay;
  overlayController: Pick<OverlayController<TOverlay>, "open" | "close">;
}

export interface ConfirmationController {
  request(options?: ConfirmationRequestOptions): Promise<boolean>;
  accept(): void;
  cancel(): void;
  close(immediate?: boolean): void;
  isPending(): boolean;
  dispose(): void;
}

function resolveInitialFocus(target: ConfirmationInitialFocus | undefined): HTMLElement | null {
  if (typeof target === "function") {
    return target() ?? null;
  }
  return target ?? null;
}

export function createConfirmationController<TOverlay extends HTMLElement = HTMLDivElement>({
  overlay,
  overlayController,
  beforeOpen,
  initialFocus,
}: CreateConfirmationControllerOptions<TOverlay>): ConfirmationController {
  let pendingResolve: ((accepted: boolean) => void) | null = null;
  let disposed = false;
  let removeFocusTrap: (() => void) | null = null;

  function getFocusableElements(): HTMLElement[] {
    return [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENT_SELECTOR)].filter(
      (element) => {
        if (
          element.hidden ||
          element.closest("[hidden]") ||
          element.closest('[aria-hidden="true"]') ||
          element.closest("[inert]") ||
          element.matches(":disabled")
        ) {
          return false;
        }
        return element.tabIndex >= 0;
      },
    );
  }

  function handleFocusTrapKeydown(event: KeyboardEvent): void {
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const activeElement = overlay.ownerDocument.activeElement;
    const activeIndex =
      activeElement instanceof HTMLElement ? focusableElements.indexOf(activeElement) : -1;
    const targetIndex = event.shiftKey
      ? activeIndex <= 0
        ? focusableElements.length - 1
        : activeIndex - 1
      : activeIndex === -1 || activeIndex === focusableElements.length - 1
        ? 0
        : activeIndex + 1;

    if (
      activeIndex === -1 ||
      (event.shiftKey && activeIndex === 0) ||
      (!event.shiftKey && activeIndex === focusableElements.length - 1)
    ) {
      event.preventDefault();
      focusableElements[targetIndex]?.focus();
    }
  }

  function activateFocusTrap(): void {
    if (removeFocusTrap) {
      return;
    }
    overlay.ownerDocument.addEventListener("keydown", handleFocusTrapKeydown);
    removeFocusTrap = () => {
      overlay.ownerDocument.removeEventListener("keydown", handleFocusTrapKeydown);
      removeFocusTrap = null;
    };
  }

  function deactivateFocusTrap(): void {
    removeFocusTrap?.();
  }

  function safeClose(immediate = false): void {
    try {
      overlayController.close(overlay, immediate);
    } catch {
      // The overlay controller may already have been disposed; preserve the request result.
    }
  }

  function takePendingResolve(): ((accepted: boolean) => void) | null {
    const resolve = pendingResolve;
    pendingResolve = null;
    return resolve;
  }

  function settlePending(accepted: boolean): void {
    deactivateFocusTrap();
    takePendingResolve()?.(accepted);
  }

  function request(requestOptions: ConfirmationRequestOptions = {}): Promise<boolean> {
    if (disposed) {
      return Promise.reject(new Error("Confirmation controller has been disposed"));
    }

    // A replacement request owns the overlay from this point onward. Settle the
    // previous promise without closing the shared overlay underneath the new one.
    settlePending(false);

    try {
      beforeOpen?.();
      requestOptions.beforeOpen?.();
      overlayController.open(overlay);
      activateFocusTrap();
      const focusOverride = Object.prototype.hasOwnProperty.call(requestOptions, "initialFocus")
        ? requestOptions.initialFocus
        : initialFocus;
      resolveInitialFocus(focusOverride)?.focus();
    } catch (error) {
      deactivateFocusTrap();
      safeClose(true);
      return Promise.reject(error);
    }

    return new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
    });
  }

  function complete(accepted: boolean): void {
    deactivateFocusTrap();
    const resolve = takePendingResolve();
    if (!resolve) {
      return;
    }

    safeClose();
    resolve(accepted);
  }

  function accept(): void {
    complete(true);
  }

  function cancel(): void {
    complete(false);
  }

  function close(immediate = false): void {
    const resolve = takePendingResolve();
    deactivateFocusTrap();
    safeClose(immediate);
    resolve?.(false);
  }

  function isPending(): boolean {
    return pendingResolve !== null;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    const resolve = takePendingResolve();
    deactivateFocusTrap();
    safeClose(true);
    resolve?.(false);
  }

  return { request, accept, cancel, close, isPending, dispose };
}
