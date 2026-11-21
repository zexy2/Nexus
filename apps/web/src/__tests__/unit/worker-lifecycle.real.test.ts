/**
 * The Temporal worker must drain on SIGTERM/SIGINT: stop polling, let
 * in-flight activities finish, then clean up and exit. It must never call
 * process.exit while worker.run() is still draining.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKER_SHUTDOWN_GRACE_TIME,
  resolveWorkerShutdownGraceTime,
  runWorkerUntilShutdown,
} from "../../../../../packages/workflows/src/worker-lifecycle";

function fakeWorker() {
  let state = "RUNNING";
  let finishRun: () => void = () => undefined;
  const runPromise = new Promise<void>((resolve) => {
    finishRun = resolve;
  });
  const worker = {
    run: vi.fn(() => runPromise),
    shutdown: vi.fn(() => {
      if (state !== "RUNNING") throw new Error(`Not running. Current state: ${state}`);
      state = "DRAINING";
    }),
    getState: () => state,
    /** Simulates the last in-flight activity finishing after shutdown. */
    drain: () => {
      state = "STOPPED";
      finishRun();
    },
  };
  return worker;
}

describe("SIGTERM drains", () => {
  it("SIGTERM calls worker.shutdown() and waits for run() to drain before cleanup", async () => {
    const signals = new EventEmitter();
    const worker = fakeWorker();
    const order: string[] = [];
    const cleanup = vi.fn(async () => {
      order.push("cleanup");
    });

    const done = runWorkerUntilShutdown({ worker, signals, cleanup, log: () => undefined });
    signals.emit("SIGTERM");

    expect(worker.shutdown).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    // Still draining: cleanup (and therefore process exit) must not happen yet.
    expect(cleanup).not.toHaveBeenCalled();

    order.push("drained");
    worker.drain();

    await expect(done).resolves.toBe(0);
    expect(order).toEqual(["drained", "cleanup"]);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("SIGINT also drains, and a repeated signal while draining is ignored", async () => {
    const signals = new EventEmitter();
    const worker = fakeWorker();
    const done = runWorkerUntilShutdown({ worker, signals, cleanup: async () => undefined, log: () => undefined });

    signals.emit("SIGINT");
    signals.emit("SIGTERM");

    expect(worker.shutdown).toHaveBeenCalledTimes(1);
    worker.drain();
    await expect(done).resolves.toBe(0);
  });

  it("does not throw when the Temporal runtime already started shutdown", async () => {
    const signals = new EventEmitter();
    const worker = fakeWorker();
    const done = runWorkerUntilShutdown({ worker, signals, cleanup: async () => undefined, log: () => undefined });

    worker.shutdown(); // Runtime's own signal hook
    expect(() => signals.emit("SIGTERM")).not.toThrow();

    worker.drain();
    await expect(done).resolves.toBe(0);
  });

  it("returns exit code 1 and still cleans up when the worker crashes", async () => {
    const signals = new EventEmitter();
    const cleanup = vi.fn(async () => undefined);
    const worker = {
      run: vi.fn(async () => {
        throw new Error("boom");
      }),
      shutdown: vi.fn(),
      getState: () => "FAILED",
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runWorkerUntilShutdown({ worker, signals, cleanup, log: () => undefined })).resolves.toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe("shutdownGraceTime", () => {
  it("defaults to a bounded grace time and accepts valid overrides", () => {
    expect(resolveWorkerShutdownGraceTime({})).toBe(DEFAULT_WORKER_SHUTDOWN_GRACE_TIME);
    expect(resolveWorkerShutdownGraceTime({ WORKER_SHUTDOWN_GRACE_TIME: "20 seconds" })).toBe("20 seconds");
    expect(resolveWorkerShutdownGraceTime({ WORKER_SHUTDOWN_GRACE_TIME: "1m" })).toBe("1m");
    expect(resolveWorkerShutdownGraceTime({ WORKER_SHUTDOWN_GRACE_TIME: "soon" })).toBe(DEFAULT_WORKER_SHUTDOWN_GRACE_TIME);
  });
});
