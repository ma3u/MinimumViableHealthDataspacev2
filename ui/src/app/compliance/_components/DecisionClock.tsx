"use client";

import { useT } from "@/lib/i18n/translate";
import { isUndecided, shortDate } from "./helpers";
import type { MatrixRow } from "./types";

/** The Art. 68(4) clock as the access body reads it. */
export function DecisionClock({ row }: { row: MatrixRow }) {
  const t = useT("access");
  if (!row.hasApplication) {
    return <span className="text-(--text-secondary)">—</span>;
  }
  if (isUndecided(row) && row.clockState === "paused") {
    return (
      <span
        className="text-(--text-primary)"
        title={t(
          "The access body found the application incomplete on {date}; the applicant has four weeks to complete it, and the three months of Art. 68(4) run again from the complete application.",
          { date: shortDate(row.incompleteNoticeAt) },
        )}
      >
        {t("clock stopped · applicant completes by {date}", {
          date: shortDate(row.completeBy),
        })}
        {typeof row.daysToComplete === "number"
          ? row.daysToComplete < 0
            ? ` · ${t("{n} days late", { n: -row.daysToComplete })}`
            : ` · ${t("{n} days left", { n: row.daysToComplete })}`
          : ""}
      </span>
    );
  }
  if (isUndecided(row) && typeof row.daysToDecision === "number") {
    const overdue = row.daysToDecision < 0;
    return (
      <span
        className={overdue ? "text-(--danger-text)" : "text-(--text-primary)"}
        title={
          overdue
            ? t(
                "The access body's decision on the data permit was due {due}, three months after the application of {submitted} (Art. 68(4)). It has neither issued nor refused the permit; the applicant may not access any data until it does (Art. 61(1)).",
                {
                  due: shortDate(row.decisionDue),
                  submitted: shortDate(row.submittedAt),
                },
              )
            : t(
                "The access body must issue or refuse the data permit by {due}, three months after the application of {submitted} (Art. 68(4)).",
                {
                  due: shortDate(row.decisionDue),
                  submitted: shortDate(row.submittedAt),
                },
              )
        }
      >
        {overdue
          ? t("permit decision was due {date}", {
              date: shortDate(row.decisionDue),
            })
          : t("permit decision due {date}", {
              date: shortDate(row.decisionDue),
            })}
        {row.extended ? ` ${t("(extended once)")}` : ""}
        {" · "}
        {overdue
          ? t("{n} days late, not decided", { n: -row.daysToDecision })
          : t("{n} days left", { n: row.daysToDecision })}
      </span>
    );
  }
  if (row.decidedAt) {
    return (
      <span className="text-(--text-secondary)">
        {t("decided {date}", { date: shortDate(row.decidedAt) })}
      </span>
    );
  }
  return <span className="text-(--text-secondary)">—</span>;
}
