import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ConfirmationController,
  type OverlayController,
  createConfirmationController,
  createOverlayController,
} from "./overlayController";

const TRANSITION_MS = 100;

interface OverlayFixture {
  first: HTMLDivElement;
  second: HTMLDivElement;
  controller: OverlayController<HTMLDivElement>;
  flushFrames(): void;
}

function createOverlayFixture(): OverlayFixture {
  document.body.innerHTML = `
    <div id="first" hidden aria-hidden="true"></div>
    <div id="second" hidden aria-hidden="true"></div>
  `;
  const first = document.querySelector<HTMLDivElement>("#first");
  const second = document.querySelector<HTMLDivElement>("#second");
  if (!first || !second) {
    throw new Error("Failed to create overlay fixture");
  }

  const frames: FrameRequestCallback[] = [];
  const controller = createOverlayController({
    overlays: [first, second],
    transitionMs: TRANSITION_MS,
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  });

  return {
    first,
    second,
    controller,
    flushFrames: () => {
      for (const callback of frames.splice(0)) {
        callback(0);
      }
    },
  };
}

describe("createOverlayController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.classList.remove("settings-overlay-open");
    document.body.className = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    document.documentElement.classList.remove("settings-overlay-open");
    document.body.classList.remove("settings-overlay-open");
  });

  it("opens with animation state and locks document scrolling", () => {
    const { first, controller, flushFrames } = createOverlayFixture();

    controller.open(first);

    expect(controller.isOpen(first)).toBe(true);
    expect(first.hidden).toBe(false);
    expect(first.getAttribute("aria-hidden")).toBe("false");
    expect(first.classList.contains("is-animating")).toBe(true);
    expect(document.documentElement.classList.contains("settings-overlay-open")).toBe(true);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(true);

    flushFrames();
    expect(first.classList.contains("is-open")).toBe(true);

    vi.advanceTimersByTime(TRANSITION_MS);
    expect(first.classList.contains("is-animating")).toBe(false);
  });

  it("keeps the body lock until every closing overlay is hidden", () => {
    const { first, second, controller } = createOverlayFixture();
    controller.open(first);
    controller.open(second);

    controller.close(first);
    expect(first.classList.contains("is-closing")).toBe(true);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(true);

    vi.advanceTimersByTime(TRANSITION_MS);
    expect(first.hidden).toBe(true);
    expect(second.hidden).toBe(false);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(true);

    controller.close(second);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(true);
    vi.advanceTimersByTime(TRANSITION_MS);

    expect(second.hidden).toBe(true);
    expect(document.documentElement.classList.contains("settings-overlay-open")).toBe(false);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(false);
  });

  it("cancels a pending close when the same overlay is reopened", () => {
    const { first, controller, flushFrames } = createOverlayFixture();
    controller.open(first);
    flushFrames();
    controller.close(first);

    vi.advanceTimersByTime(TRANSITION_MS / 2);
    controller.open(first);
    flushFrames();
    vi.advanceTimersByTime(TRANSITION_MS);

    expect(first.hidden).toBe(false);
    expect(first.classList.contains("is-closing")).toBe(false);
    expect(first.classList.contains("is-open")).toBe(true);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(true);
  });

  it("immediately closes and invalidates a queued opening frame", () => {
    const { first, controller, flushFrames } = createOverlayFixture();
    controller.open(first);

    controller.close(first, true);
    flushFrames();

    expect(first.hidden).toBe(true);
    expect(first.getAttribute("aria-hidden")).toBe("true");
    expect(first.className).toBe("");
    expect(controller.isOpen(first)).toBe(false);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dispose cancels timers, closes overlays, and removes the body lock", () => {
    const { first, second, controller, flushFrames } = createOverlayFixture();
    controller.open(first);
    controller.open(second);
    controller.close(first);

    controller.dispose();
    flushFrames();
    vi.runAllTimers();

    expect(first.hidden).toBe(true);
    expect(second.hidden).toBe(true);
    expect(first.className).toBe("");
    expect(second.className).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    expect(document.documentElement.classList.contains("settings-overlay-open")).toBe(false);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(false);
  });
});

describe("createConfirmationController", () => {
  let overlay: HTMLDivElement;
  let acceptButton: HTMLButtonElement;
  let cancelButton: HTMLButtonElement;
  let overlayController: OverlayController<HTMLDivElement>;
  let confirmation: ConfirmationController;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="confirmation" hidden aria-hidden="true">
        <button id="accept">Accept</button>
        <button id="cancel">Cancel</button>
      </div>
    `;
    const overlayElement = document.querySelector<HTMLDivElement>("#confirmation");
    const acceptElement = document.querySelector<HTMLButtonElement>("#accept");
    const cancelElement = document.querySelector<HTMLButtonElement>("#cancel");
    if (!overlayElement || !acceptElement || !cancelElement) {
      throw new Error("Failed to create confirmation fixture");
    }
    overlay = overlayElement;
    acceptButton = acceptElement;
    cancelButton = cancelElement;
    overlayController = createOverlayController({
      overlays: [overlay],
      transitionMs: TRANSITION_MS,
      requestAnimationFrame: (callback) => {
        callback(0);
        return 0;
      },
    });
    confirmation = createConfirmationController({ overlay, overlayController });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    document.documentElement.classList.remove("settings-overlay-open");
    document.body.classList.remove("settings-overlay-open");
  });

  it("settles a superseded request as false without closing the replacement", async () => {
    const firstRequest = confirmation.request();
    const secondRequest = confirmation.request();

    await expect(firstRequest).resolves.toBe(false);
    expect(confirmation.isPending()).toBe(true);
    expect(overlay.hidden).toBe(false);

    confirmation.accept();
    confirmation.cancel();
    confirmation.close(true);

    await expect(secondRequest).resolves.toBe(true);
    expect(confirmation.isPending()).toBe(false);
  });

  it("settles accept, cancel, and close paths exactly once", async () => {
    const accepted = confirmation.request();
    confirmation.accept();
    confirmation.accept();
    await expect(accepted).resolves.toBe(true);

    const canceled = confirmation.request();
    confirmation.cancel();
    confirmation.accept();
    await expect(canceled).resolves.toBe(false);

    const closed = confirmation.request();
    confirmation.close(true);
    confirmation.cancel();
    await expect(closed).resolves.toBe(false);
    expect(confirmation.isPending()).toBe(false);
  });

  it("runs hooks before opening and supports request-specific initial focus", async () => {
    const calls: string[] = [];
    confirmation = createConfirmationController({
      overlay,
      overlayController,
      beforeOpen: () => {
        expect(overlay.hidden).toBe(true);
        calls.push("default");
      },
      initialFocus: acceptButton,
    });

    const request = confirmation.request({
      beforeOpen: () => {
        expect(overlay.hidden).toBe(true);
        calls.push("request");
      },
      initialFocus: () => cancelButton,
    });

    expect(calls).toEqual(["default", "request"]);
    expect(document.activeElement).toBe(cancelButton);
    confirmation.cancel();
    await expect(request).resolves.toBe(false);
  });

  it("dispose closes the overlay and settles a pending request as false", async () => {
    const request = confirmation.request({ initialFocus: acceptButton });

    confirmation.dispose();

    await expect(request).resolves.toBe(false);
    expect(confirmation.isPending()).toBe(false);
    expect(overlay.hidden).toBe(true);
    expect(document.body.classList.contains("settings-overlay-open")).toBe(false);
  });
});
