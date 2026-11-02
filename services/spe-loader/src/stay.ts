// ---------------------------------------------------------------------------
// Staying up for real (#833)
// ---------------------------------------------------------------------------
// The ACI group's `spe-ingest` sidecar has to keep running after the load, or
// the group's restartPolicy Always restarts it and the load check runs again
// (42 restarts in ten minutes, exit 0, 2026-11-02). A promise that never
// resolves does not keep Node alive: once the workspace driver is closed the
// event loop is empty and the process ends with code 0. A referenced timer
// does keep it alive. It fires once every ~24 days and does nothing, so there
// is no busy work; SIGTERM (ACI stop, docker stop) or SIGINT ends the wait.
//
// No imports from the package's other modules: a test starts this file in a
// child Node process to see that it really keeps the process running.

/** The longest delay a Node timer accepts (2^31 - 1 ms, about 24.8 days). */
export const KEEP_ALIVE_MS = 2 ** 31 - 1;

export interface SignalSource {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  removeListener(signal: NodeJS.Signals, listener: () => void): unknown;
}

export interface StayOptions {
  /** Where the signals come from: the process, or a test's emitter. */
  source?: SignalSource;
  signals?: NodeJS.Signals[];
  log?: (msg: string) => void;
}

/**
 * Resolves with the signal that ended the wait, never before. Until then a
 * referenced timer keeps the event loop, and so the process, alive.
 */
export function stayUp(options: StayOptions = {}): Promise<NodeJS.Signals> {
  const source = options.source ?? process;
  const signals = options.signals ?? ["SIGTERM", "SIGINT"];
  return new Promise((resolve) => {
    const keepAlive = setInterval(() => undefined, KEEP_ALIVE_MS);
    const listeners = new Map<NodeJS.Signals, () => void>();
    for (const signal of signals) {
      const listener = () => {
        clearInterval(keepAlive);
        for (const [s, l] of listeners) source.removeListener(s, l);
        options.log?.(`${signal}: stopping`);
        resolve(signal);
      };
      listeners.set(signal, listener);
      source.once(signal, listener);
    }
  });
}
