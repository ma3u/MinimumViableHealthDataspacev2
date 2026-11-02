"use client";

import { APPLICATION_ITEMS, hasApplicationItem } from "@/lib/permits";
import { useT } from "@/lib/i18n/translate";
import type { MatrixRow } from "./types";

/**
 * The application as submitted and, for the access body, the decision form:
 * the Art. 68(1) criteria, the Art. 53(1) purpose, validity, conditions, and
 * the written justification a refusal must carry (Art. 57(1)(j)(iii)).
 */
/** The eleven items of Art. 67(2) as the application carries them. */
export function ApplicationItemsList({ row }: { row: MatrixRow }) {
  const t = useT("access");
  const value = (item: (typeof APPLICATION_ITEMS)[number]["item"]): string => {
    switch (item) {
      case "a":
        return row.namedPersons ?? "";
      case "b":
        return row.requestedPurpose ?? "";
      case "c":
        return row.intendedUse ?? "";
      case "d":
        return [row.requestedData, row.dataTimeRange, row.dataFormats]
          .filter(Boolean)
          .join(" · ");
      case "e":
        return row.identifiability
          ? `${t(row.identifiability.toLowerCase())}${
              row.pseudonymisationJustification
                ? `: ${row.pseudonymisationJustification}`
                : ""
            }`
          : "";
      case "f":
        return row.datasetsBroughtIn ?? "";
      case "g":
        return row.safeguards ?? "";
      case "h":
        return row.processingPeriodMonths
          ? t("{n} months", { n: row.processingPeriodMonths })
          : "";
      case "i":
        return row.speTools ?? "";
      case "j":
        return row.ethicsCommitteeRef ?? "";
      case "k":
        return typeof row.art71Exception === "boolean"
          ? row.art71Exception
            ? t("invoked: {reason}", {
                reason: row.art71ExceptionJustification ?? "",
              })
            : t("not invoked")
          : "";
    }
  };
  const c = row.completeness;
  return (
    <details
      className="text-xs rounded-lg border border-(--border) bg-(--bg) p-3"
      data-testid="application-items"
    >
      <summary className="cursor-pointer font-semibold text-(--text-primary)">
        {t("Art. 67(2) items:")}{" "}
        {c
          ? c.complete
            ? t("complete, {n} of {total}", { n: c.present, total: c.total })
            : t("incomplete, {n} of {total}", {
                n: c.present,
                total: c.total,
              })
          : "—"}
      </summary>
      <ol className="mt-2 space-y-1">
        {APPLICATION_ITEMS.map((i) => {
          const present = hasApplicationItem(row, i.item);
          return (
            <li key={i.item} className="flex gap-2">
              <span
                className={
                  present ? "text-(--success-text)" : "text-(--danger-text)"
                }
                aria-label={present ? t("present") : t("missing")}
              >
                {present ? "✓" : "✗"}
              </span>
              <span>
                <span className="text-(--text-secondary)">
                  ({i.item}) {t(i.label)}:{" "}
                </span>
                {present ? value(i.item) : t("missing")}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
