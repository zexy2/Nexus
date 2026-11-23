import { after } from "next/server";

/**
 * Runs `task` after the HTTP response has been sent.
 *
 * Uses Next.js `after()`, which keeps the work attached to the request
 * lifecycle on the Node server. Outside a request scope (scripts, unit tests)
 * `after()` throws, and the task is started detached instead. Errors are always
 * caught and logged; callers must record their own failure state.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>) {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[background] ${label} failed:`, error);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
