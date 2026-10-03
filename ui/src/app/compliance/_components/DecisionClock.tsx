"use client";

import { isUndecided, shortDate } from "./helpers";
import type { MatrixRow } from "./types";

/** The Art. 68(4) clock as the access body reads it. */
export function DecisionClock({ row }: { row: MatrixRow }) {
  if (!row.hasApplication) {
    return <span className="text-[var(--text-secondary)]">—</span>;
  }
  if (isUndecided(row) && row.clockState === "paused") {
    return (
      <span
        className="text-[var(--text-primary)]"
        title={`The access body found the application incomplete on ${shortDate(
          row.incompleteNoticeAt,
        )}; the applicant has four weeks to complete it, and the three months of Art. 68(4) run again from the complete application.`}
      >
        clock stopped · applicant completes by {shortDate(row.completeBy)}
        {typeof row.daysToComplete === "number"
          ? row.daysToComplete < 0
            ? ` · ${-row.daysToComplete} days late`
            : ` · ${row.daysToComplete} days left`
          : ""}
      </span>
    );
  }
  if (isUndecided(row) && typeof row.daysToDecision === "number") {
    const overdue = row.daysToDecision < 0;
    return (
      <span
        className={
          overdue ? "text-[var(--danger-text)]" : "text-[var(--text-primary)]"
        }
        title={
          overdue
            ? `The access body's decision on the data permit was due ${shortDate(
                row.decisionDue,
              )}, three months after the application of ${shortDate(
                row.submittedAt,
              )} (Art. 68(4)). It has neither issued nor refused the permit; the applicant may not access any data until it does (Art. 61(1)).`
            : `The access body must issue or refuse the data permit by ${shortDate(
                row.decisionDue,
              )}, three months after the application of ${shortDate(
                row.submittedAt,
              )} (Art. 68(4)).`
        }
      >
        {overdue ? "permit decision was due " : "permit decision due "}
        {shortDate(row.decisionDue)}
        {row.extended ? " (extended once)" : ""}
        {" · "}
        {overdue
          ? `${-row.daysToDecision} days late, not decided`
          : `${row.daysToDecision} days left`}
      </span>
    );
  }
  if (row.decidedAt) {
    return (
      <span className="text-[var(--text-secondary)]">
        decided {shortDate(row.decidedAt)}
      </span>
    );
  }
  return <span className="text-[var(--text-secondary)]">—</span>;
}
