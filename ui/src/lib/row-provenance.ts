/**
 * Where a listed exchange row came from, and whether it can be opened.
 *
 * Issue #358. `/api/negotiations` and `/api/transfers` merge three sources into
 * one list: what the control plane holds, the demo records this process wrote
 * (`lib/demo-records.ts`), and the bundled mock fixtures. The detail routes
 * `/api/negotiations/{id}` and `/api/transfers/{id}` ask the **control plane
 * alone**, so opening a demo or mock row answers 502 and a person reading the
 * list has no way to tell which rows those are.
 *
 * The merge itself is deliberate: it keeps the walkthrough demonstrable while
 * the connector cannot take real negotiations (see the comments in
 * `app/api/negotiations/route.ts`). The defect is that the provenance was lost
 * on the way out. Each row now carries it, so the page can badge or disable
 * what it cannot open, and a test can assert only on rows that are real.
 *
 * `openable` is the question callers actually have, answered once here rather
 * than by each of them re-deriving it from `source`.
 */

export type RowSource = "controlplane" | "demo" | "mock";

/** Added to every row returned by the exchange list endpoints. */
export interface RowProvenance {
  /** Which of the three sources the row came from. */
  source: RowSource;
  /** Whether the matching detail endpoint can serve this row. */
  openable: boolean;
}

/**
 * Tag rows with their origin. Returns new objects; the inputs are untouched,
 * because the mock fixtures are module-level and shared between requests.
 */
export function tagRows<T>(
  rows: T[],
  source: RowSource,
): (T & RowProvenance)[] {
  const openable = source === "controlplane";
  return rows.map((row) => ({
    ...(row as object),
    source,
    openable,
  })) as (T & RowProvenance)[];
}
