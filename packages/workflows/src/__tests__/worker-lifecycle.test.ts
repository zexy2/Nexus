import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKER_SHUTDOWN_GRACE_TIME,
  resolveWorkerShutdownGraceTime,
  runWorkerUntilShutdown,
  type DrainableWorker,
} from "../worker-lifecycle";

describe("resolveWorkerShutdownGraceTime", () => {
  it.each(["45 seconds", "1m", "500ms", "2 minutes", "1.5s", " 30 sec "])("accepts %j", (value) => {
    expect(resolveWorkerShutdownGraceTime({ WORKER_SHUTDOWN_GRACE_TIME: value })).toBe(value.trim());
  });

  it.each([undefined, "", "forever", "10", "5 hours", "-1s"])("falls back to the default for %j", (value) => {
    expect(resolveWorkerShutdownGraceTime({ WORKER_SHUTDOWN_GRACE_TIME: value })).toBe(
      DEFAULT_WORKER_SHUTDOWN_GRACE_TIME
    );
  });
});

function fakeWorker(options: { failRun?: boolean; shutdownThrows?: boolean } = {}) {
  let state = "RUNNING";
  let release!: () => void;
  const stopped = new Promise<void>((resolve) => {
    release = resolve;
  });
  const worker: DrainableWorker & { shutdown: ReturnType<typeof vi.fn> } = {
    run: async () => {
      if (options.failRun) throw new Error("run failed");
      await stopped;
      state = "STOPPED";
    },
    shutdown: vi.fn(() => {
      if (options.shutdownThrows) throw new Error("not running");
      state = "DRAINING";
      release();
    }),
    getState: () => state,
  };
  return { worker, setState: (next: string) => (state = next), release };
}

describe("runWorkerUntilShutdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drains on SIGTERM, runs cleanup, removes listeners and exits 0", async () => {
    const signals = new EventEmitter();
    const { worker } = fakeWorker();
    const cleanup = vi.fn(async () => undefined);
    const log = vi.fn();

    const done = runWorkerUntilShutdown({ worker, signals, cleanup, log });
    expect(signals.listenerCount("SIGTERM")).toBe(1);
    expect(signals.listenerCount("SIGINT")).toBe(1);

    signals.emit("SIGTERM");
    await expect(done).resolves.toBe(0);

    expect(worker.shutdown).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("SIGTERM"));
  });

  it("does not call shutdown when the worker is no longer RUNNING", async () => {
    const signals = new EventEmitter();
    const { worker, setState, release } = fakeWorker();
    const done = runWorkerUntilShutdown({ worker, signals, cleanup: async () => undefined, log: () => undefined });

    setState("STOPPING");
    signals.emit("SIGINT");
    expect(worker.shutdown).not.toHaveBeenCalled();
    release();
    await expect(done).resolves.toBe(0);
  });

  it("logs and ignores a throwing shutdown request", async () => {
    const signals = new EventEmitter();
    const { worker, release } = fakeWorker({ shutdownThrows: true });
    const log = vi.fn();
    const done = runWorkerUntilShutdown({ worker, signals, cleanup: async () => undefined, log });

    signals.emit("SIGTERM");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Worker shutdown request ignored: not running"));
    release();
    await expect(done).resolves.toBe(0);
  });

  it("returns 1 when the worker fails and still runs cleanup, tolerating cleanup errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const signals = new EventEmitter();
    const { worker } = fakeWorker({ failRun: true });
    const cleanup = vi.fn(async () => {
      throw new Error("db close failed");
    });

    await expect(runWorkerUntilShutdown({ worker, signals, cleanup, log: () => undefined })).resolves.toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Worker cleanup failed:", expect.any(Error));
  });
});
