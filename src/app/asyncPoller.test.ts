import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AsyncPollerRuntime, createAsyncPoller } from "./asyncPoller";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createAsyncPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts immediately and remains idempotent", async () => {
    const task = vi.fn(async () => "value");
    const onValue = vi.fn();
    const poller = createAsyncPoller({
      intervalMs: 1_000,
      task,
      onValue,
    });

    poller.start();
    poller.start();
    await flushPromises();

    expect(task).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith("value");

    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("prevents overlapping work for automatic and forced refreshes", async () => {
    const first = createDeferred<string>();
    const task = vi.fn(() => first.promise);
    const poller = createAsyncPoller({
      intervalMs: 1_000,
      task,
      onValue: vi.fn(),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(task).toHaveBeenCalledTimes(1);
    await expect(poller.refresh(true)).resolves.toBe(false);

    first.resolve("done");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("honors the minimum refresh gap and lets force bypass only that gap", async () => {
    let now = 5_000;
    const runtime: AsyncPollerRuntime = {
      now: () => now,
      setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
      clearTimeout: (handle) => globalThis.clearTimeout(handle),
    };
    const task = vi.fn(async () => "value");
    let allowed = true;
    const poller = createAsyncPoller({
      intervalMs: 1_000,
      minRefreshGapMs: 5_000,
      runtime,
      shouldRun: () => allowed,
      task,
      onValue: vi.fn(),
    });

    poller.markRefreshed();
    poller.start();
    await flushPromises();
    expect(task).not.toHaveBeenCalled();

    await expect(poller.refresh()).resolves.toBe(false);
    await expect(poller.refresh(true)).resolves.toBe(true);
    expect(task).toHaveBeenCalledTimes(1);

    allowed = false;
    now += 10_000;
    await expect(poller.refresh(true)).resolves.toBe(false);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("measures the minimum gap from the latest successful completion", async () => {
    const task = vi.fn(async () => "value");
    const poller = createAsyncPoller({
      intervalMs: 1_000,
      minRefreshGapMs: 3_000,
      task,
      onValue: vi.fn(),
    });

    poller.start();
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_999);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("drops stale values and errors after stop or generation changes", async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const third = createDeferred<string>();
    const task = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);
    const onValue = vi.fn();
    const onError = vi.fn();
    const poller = createAsyncPoller({
      intervalMs: 1_000,
      minRefreshGapMs: 10_000,
      task,
      onValue,
      onError,
    });

    poller.start();
    poller.stop();
    poller.start();
    expect(task).toHaveBeenCalledTimes(2);

    first.reject(new Error("stale"));
    await flushPromises();
    expect(onError).not.toHaveBeenCalled();
    await expect(poller.refresh(true)).resolves.toBe(false);

    poller.stop();
    poller.start();
    expect(task).toHaveBeenCalledTimes(3);

    second.resolve("also stale");
    await flushPromises();
    expect(onValue).not.toHaveBeenCalled();
    await expect(poller.refresh(true)).resolves.toBe(false);

    third.resolve("current");
    await flushPromises();
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith("current");
  });

  it("reports a task failure and continues on the next interval", async () => {
    const failure = new Error("temporary failure");
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce("recovered");
    const onValue = vi.fn();
    const onError = vi.fn();
    const poller = createAsyncPoller({
      intervalMs: 1_000,
      task,
      onValue,
      onError,
    });

    poller.start();
    await flushPromises();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onValue).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onValue).toHaveBeenCalledWith("recovered");
  });

  it("stops scheduled work and validates configuration", async () => {
    const task = vi.fn(async () => "value");
    const poller = createAsyncPoller({
      intervalMs: 1_000,
      task,
      onValue: vi.fn(),
    });

    poller.start();
    await flushPromises();
    poller.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(task).toHaveBeenCalledTimes(1);

    expect(() => createAsyncPoller({ intervalMs: 0, task, onValue: vi.fn() })).toThrow(RangeError);
    expect(() =>
      createAsyncPoller({
        intervalMs: 1_000,
        minRefreshGapMs: -1,
        task,
        onValue: vi.fn(),
      }),
    ).toThrow(RangeError);
  });
});
