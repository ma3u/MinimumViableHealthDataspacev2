/**
 * Fees, Regulation (EU) 2025/327 Art. 62: transparent, proportionate to the
 * cost of making the data available, split between the access body and the
 * data holder, with reduced fees for public sector bodies, academic
 * researchers and micro-enterprises (Art. 62(3)). The schedule is the demo's
 * own and fictional; the regulation leaves the amounts to the Member States.
 * Issue #206, M7.
 */
import {
  APPLICANT_CATEGORY_LABELS,
  type ApplicantCategory,
} from "@/lib/permits";

export const FEE_ARTICLE = "Regulation (EU) 2025/327, Art. 62";

/** EUR. What the access body's work costs: receipt, assessment, the SPE. */
export const BODY_FEES = {
  assessment: 1500,
  perDataset: 250,
  spePerMonth: 50,
} as const;

/** EUR. What the holder's work costs: extraction, pseudonymisation, delivery. */
export const HOLDER_FEES = {
  pseudonymised: 2000,
  anonymised: 800,
} as const;

/** EUR. A health data request (Art. 69) costs the body one statistical run. */
export const REQUEST_FEE_EUR = 300;

/** Art. 62(3): the share taken off for the reduced categories. */
export const CATEGORY_REDUCTION: Record<ApplicantCategory, number> = {
  PUBLIC_SECTOR: 0.75,
  ACADEMIC: 0.5,
  MICRO_ENTERPRISE: 0.5,
  COMMERCIAL: 0,
};

export interface FeeEstimate {
  category: ApplicantCategory;
  categoryLabel: string;
  reduction: number;
  bodyEur: number;
  holderEur: number;
  totalEur: number;
  basis: string[];
  article: string;
}

export function estimateFee(input: {
  applicantCategory?: string | null;
  processingPeriodMonths?: number | null;
  identifiability?: string | null;
  datasets?: number;
}): FeeEstimate {
  const category = (
    input.applicantCategory && input.applicantCategory in CATEGORY_REDUCTION
      ? input.applicantCategory
      : "COMMERCIAL"
  ) as ApplicantCategory;
  const months = Math.max(1, Math.round(input.processingPeriodMonths ?? 12));
  const datasets = Math.max(1, input.datasets ?? 1);
  const pseudonymised =
    (input.identifiability ?? "PSEUDONYMISED") !== "ANONYMISED";
  const reduction = CATEGORY_REDUCTION[category];
  const bodyFull =
    BODY_FEES.assessment +
    BODY_FEES.perDataset * datasets +
    BODY_FEES.spePerMonth * months;
  const holderFull =
    (pseudonymised ? HOLDER_FEES.pseudonymised : HOLDER_FEES.anonymised) *
    datasets;
  const bodyEur = Math.round(bodyFull * (1 - reduction));
  const holderEur = Math.round(holderFull * (1 - reduction));
  return {
    category,
    categoryLabel: APPLICANT_CATEGORY_LABELS[category],
    reduction,
    bodyEur,
    holderEur,
    totalEur: bodyEur + holderEur,
    basis: [
      `access body: assessment ${BODY_FEES.assessment} + ${datasets} dataset(s) at ${BODY_FEES.perDataset} + ${months} month(s) of the secure processing environment at ${BODY_FEES.spePerMonth}`,
      `data holder: ${datasets} ${
        pseudonymised ? "pseudonymised" : "anonymised"
      } extraction(s) at ${
        pseudonymised ? HOLDER_FEES.pseudonymised : HOLDER_FEES.anonymised
      }`,
      reduction > 0
        ? `reduced by ${Math.round(reduction * 100)}% for a ${
            APPLICANT_CATEGORY_LABELS[category]
          } (Art. 62(3))`
        : "no reduction (Art. 62(3) does not apply)",
    ],
    article: FEE_ARTICLE,
  };
}
