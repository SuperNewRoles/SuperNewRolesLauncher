export type AsyncPollerTimerHandle = ReturnType<typeof globalThis.setTimeout>;

/**
 * ポーラーの時刻取得とタイマー操作を抽象化する。
 * テストでは fake timer / clock を注入できる。
 */
export interface AsyncPollerRuntime {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): AsyncPollerTimerHandle;
  clearTimeout(handle: AsyncPollerTimerHandle): void;
}

export interface AsyncPollerOptions<T> {
  /** 自動更新の間隔。 */
  intervalMs: number;
  /** 成功した更新から次の通常更新までに空ける最小時間。 */
  minRefreshGapMs?: number;
  /** 値の取得だけを行う。UI などへの反映は onValue に分離する。 */
  task: () => Promise<T> | T;
  /** 現在の世代で取得に成功した値だけが渡される。 */
  onValue: (value: T) => void;
  /** 現在の世代で発生した失敗だけが渡される。 */
  onError?: (error: unknown) => void;
  /** false の間は自動・手動のどちらの更新も実行しない。 */
  shouldRun?: () => boolean;
  runtime?: AsyncPollerRuntime;
}

export interface AsyncPoller {
  /** 即時更新を試み、自動更新を開始する。複数回呼んでも多重起動しない。 */
  start(): void;
  /** 自動更新を止め、進行中の古い結果を無効化する。 */
  stop(): void;
  /**
   * 更新を試みる。force は最小更新間隔だけを無視する。
   * 成功した値が現在の世代へ反映された場合に true を返す。
   */
  refresh(force?: boolean): Promise<boolean>;
  /** 外部で最新値を得た場合に、最終更新時刻を進める。 */
  markRefreshed(at?: number): void;
}

const DEFAULT_RUNTIME: AsyncPollerRuntime = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

interface ActiveRequest {
  generation: number;
  token: object;
}

function requireFiniteDuration(value: number, name: string, allowZero: boolean): void {
  const isInRange = allowZero ? value >= 0 : value > 0;
  if (!Number.isFinite(value) || !isInRange) {
    const expectation = allowZero ? "a finite non-negative number" : "a finite positive number";
    throw new RangeError(`${name} must be ${expectation}.`);
  }
}

/**
 * 非同期取得、一定間隔の再実行、世代管理をまとめた小さなポーラーを生成する。
 */
export function createAsyncPoller<T>(options: AsyncPollerOptions<T>): AsyncPoller {
  const {
    intervalMs,
    task,
    onValue,
    onError,
    shouldRun = () => true,
    minRefreshGapMs = 0,
    runtime = DEFAULT_RUNTIME,
  } = options;

  requireFiniteDuration(intervalMs, "intervalMs", false);
  requireFiniteDuration(minRefreshGapMs, "minRefreshGapMs", true);

  let running = false;
  let generation = 0;
  let timerHandle: AsyncPollerTimerHandle | null = null;
  let activeRequest: ActiveRequest | null = null;
  let lastRefreshedAt: number | null = null;

  const isCurrentRequest = (request: ActiveRequest): boolean =>
    running && request.generation === generation && activeRequest?.token === request.token;

  const reportError = (error: unknown): void => {
    try {
      onError?.(error);
    } catch {
      // エラーハンドラーの失敗でポーリング自体を停止させない。
    }
  };

  const canRefresh = (force: boolean): boolean => {
    if (!running || activeRequest !== null) {
      return false;
    }

    try {
      if (!shouldRun()) {
        return false;
      }
    } catch (error) {
      reportError(error);
      return false;
    }

    if (force || lastRefreshedAt === null) {
      return true;
    }
    return runtime.now() - lastRefreshedAt >= minRefreshGapMs;
  };

  const refresh = async (force = false): Promise<boolean> => {
    if (!canRefresh(force)) {
      return false;
    }

    const request: ActiveRequest = {
      generation,
      token: {},
    };
    activeRequest = request;

    try {
      const value = await task();
      if (!isCurrentRequest(request)) {
        return false;
      }

      try {
        onValue(value);
      } catch (error) {
        if (isCurrentRequest(request)) {
          reportError(error);
        }
        return false;
      }

      if (!isCurrentRequest(request)) {
        return false;
      }
      lastRefreshedAt = runtime.now();
      return true;
    } catch (error) {
      if (isCurrentRequest(request)) {
        reportError(error);
      }
      return false;
    } finally {
      if (activeRequest?.token === request.token) {
        activeRequest = null;
      }
    }
  };

  const scheduleNext = (expectedGeneration: number): void => {
    if (!running || generation !== expectedGeneration || timerHandle !== null) {
      return;
    }

    timerHandle = runtime.setTimeout(() => {
      timerHandle = null;
      if (!running || generation !== expectedGeneration) {
        return;
      }

      void refresh();
      scheduleNext(expectedGeneration);
    }, intervalMs);
  };

  return {
    start(): void {
      if (running) {
        return;
      }

      running = true;
      generation += 1;
      const currentGeneration = generation;
      void refresh();
      scheduleNext(currentGeneration);
    },

    stop(): void {
      if (!running) {
        return;
      }

      running = false;
      generation += 1;
      activeRequest = null;
      if (timerHandle !== null) {
        runtime.clearTimeout(timerHandle);
        timerHandle = null;
      }
    },

    refresh,

    markRefreshed(at = runtime.now()): void {
      if (!Number.isFinite(at)) {
        throw new RangeError("refreshed time must be a finite number.");
      }
      lastRefreshedAt = at;
    },
  };
}
