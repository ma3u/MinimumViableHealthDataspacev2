/**
 * One page of a list the hub reads from the control plane: the negotiations
 * and the transfers of a participant context.
 *
 * Each row is a JSON-LD object the control plane compacts on every read, so
 * a list costs in proportion to its rows. Measured on the compose stack on
 * 2026-11-11: 200 negotiations were 545 kB and about 500 ms, 50 were 140 kB
 * and about 100 ms; 200 transfers about 160 to 300 ms, 50 about 40 ms. On
 * Azure, at 0.5 vCPU, the 200-row transfer list had a p95 of 1.26 to 2.18 s
 * under the `contracts` load test (docs/developer/edc-sizing-under-load.md).
 */

/** What a page holds when the caller does not say. */
export const DEFAULT_PAGE_SIZE = 50;
/** The most a caller may ask for, the old fixed size of both lists. */
export const MAX_PAGE_SIZE = 200;

export interface ListPage {
  limit: number;
  offset: number;
}

/**
 * The page a request asks for with `limit` and `offset`, or an error
 * message for a value that is not a whole number in range. A `limit` over
 * MAX_PAGE_SIZE is lowered to it rather than refused.
 */
export function pageFrom(
  params: URLSearchParams,
): ListPage | { error: string } {
  const read = (name: string, fallback: number, min: number) => {
    const raw = params.get(name);
    if (raw === null || raw === "") return fallback;
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n >= min ? n : null;
  };
  const limit = read("limit", DEFAULT_PAGE_SIZE, 1);
  if (limit === null) {
    return { error: `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}` };
  }
  const offset = read("offset", 0, 0);
  if (offset === null) return { error: "offset must be a whole number from 0" };
  return { limit: Math.min(limit, MAX_PAGE_SIZE), offset };
}
