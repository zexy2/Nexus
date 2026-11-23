/**
 * Graceful worker lifecycle.
 *
 * On SIGTERM/SIGINT the worker must stop polling and let in-flight activities
 * finish (bounded by `shutdownGraceTime`) before the process exits. Exiting
 * immediately abandons external writes mid-provider-call and leaves their
 * claims to expire, so deploys would routinely interrupt work.
 *
 * Kept free of Temporal imports so it can be unit-tested with fakes.
 */

export const DEFAULT_WORKER_SHUTDOWN_GRACE_TIME = "45 seconds";
export const WORKER_SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;

type ShutdownSignal = (typeof WORKER_SHUTDOWN_SIGNALS)[number];

export type DrainableWorker = {
  run(): Promise<void>;
  shutdown(): void;
  getState(): string;
};

export type SignalSource = {
  once(signal: ShutdownSignal, listener: () => void): unknown;
  off?(signal: ShutdownSignal, listener: () => void): unknown;
};

const GRACE_TIME_PATTERN = /^\d+(?:\.\d+)?\s*(?:ms|s|sec|secs|seconds?|m|min|mins|minutes?)$/i;

/** `WORKER_SHUTDOWN_GRACE_TIME` (e.g. "45 seconds", "1m"); invalid values fall back to the default. */
export function resolveWorkerShutdownGraceTime(env: Record<string, string | undefined> = process.env) {
  const value = env.WORKER_SHUTDOWN_GRACE_TIME?.trim();
  return value && GRACE_TIME_PATTERN.test(value) ? value : DEFAULT_WORKER_SHUTDOWN_GRACE_TIME;
}

/**
 * Runs the worker until it stops, translating shutdown signals into
 * `worker.shutdown()` (drain) rather than `process.exit`. Resolves with the
 * exit code once the worker has drained and cleanup ran.
 */
export async function runWorkerUntilShutdown(options: {
  worker: DrainableWorker;
  signals: SignalSource;
  cleanup: () => Promise<void>;
  log?: (message: string) => void;
}): Promise<number> {
  const { worker, signals, cleanup } = options;
  const log = options.log ?? ((message: string) => console.log(message));
  const listeners = new Map<ShutdownSignal, () => void>();

  for (const signal of WORKER_SHUTDOWN_SIGNALS) {
    const listener = () => {
      log(`Received ${signal}; draining worker before exit...`);
      // The Temporal Runtime may already have started shutdown from its own
      // signal hook; shutdown() throws unless the worker is RUNNING.
      if (worker.getState() !== "RUNNING") return;
      try {
        worker.shutdown();
      } catch (error) {
        log(`Worker shutdown request ignored: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    listeners.set(signal, listener);
    signals.once(signal, listener);
  }

  let exitCode = 0;
  try {
    await worker.run();
    log("Worker drained and stopped.");
  } catch (error) {
    exitCode = 1;
    console.error("Worker stopped with an error:", error);
  } finally {
    for (const [signal, listener] of listeners) signals.off?.(signal, listener);
    try {
      await cleanup();
    } catch (error) {
      console.warn("Worker cleanup failed:", error);
    }
  }
  return exitCode;
}
