import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { UnlockOutcome } from "./load.js";
import { stayUp, type StayOptions } from "./stay.js";

export interface IngestCommandDeps {
  /** Loads the extract into the workspace; the exit code (0 loaded or kept, 3 refused). */
  load: (outcome: UnlockOutcome, plaintext: Buffer | null) => Promise<number>;
  log: (msg: string) => void;
  /** Where SIGTERM/SIGINT come from (the process unless a test says otherwise). */
  signals?: StayOptions["source"];
}

/**
 * `spe-loader ingest`: load what the init container `spe-unlock` left in
 * <work>. Without `--stay` it is a one-shot job and resolves with the load's
 * code. With `--stay` (the ACI sidecar `spe-ingest`) it resolves only on
 * SIGTERM or SIGINT, so the container keeps running and restartPolicy Always
 * has nothing to restart (#833).
 */
export async function ingestCommand(
  work: string,
  stay: boolean,
  deps: IngestCommandDeps,
): Promise<number> {
  const outcome = JSON.parse(
    readFileSync(join(work, "unlock.json"), "utf8"),
  ) as UnlockOutcome;
  const file = join(work, "extract.jsonl");
  const plaintext = existsSync(file) ? readFileSync(file) : null;
  const code = await deps.load(outcome, plaintext);
  // The plain extract has done its job; the data now lives in Neo4j's memory-backed store.
  if (plaintext) rmSync(file, { force: true });
  if (stay) {
    deps.log("loaded; staying up so the pod keeps running");
    await stayUp({ source: deps.signals, log: deps.log });
  }
  return code;
}
