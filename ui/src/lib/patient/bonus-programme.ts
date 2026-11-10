/**
 * A bonus program of another data space, as /api/patient/programmes returns
 * it (#934, step 3). Here and not in the route: the page imports it, and the
 * static build removes src/app/api.
 */
export interface BonusProgramme {
  programmeId: string;
  title: string;
  description: string | null;
  publisherName: string;
  publisherDid: string;
  dataSpace: string | null;
  endpointUrl: string | null;
  ruleTitle: string | null;
  ruleDescription: string | null;
  ruleVersion: string | null;
  lastSeenAt: string | null;
}

/** One consent of the person to one program (#934, step 4). */
export interface ProgrammeConsent {
  consentId: string;
  programmeId: string;
  joinedAt: string;
  withdrawnAt: string | null;
}

/**
 * The member's own result for one program year (#934, step 6; ADR-087), as
 * /api/patient/programmes/evaluation returns it. The breakdown is for the
 * member's eyes; a transfer carries the year and goalMet only.
 */
export type YearEvaluation =
  | {
      year: number;
      status: "year-not-over";
      /** The first day the year can be evaluated. */
      evaluableFrom: string;
    }
  | {
      year: number;
      status: "evaluated";
      goalMet: boolean;
      activity: {
        minutesPerWeek: number;
        required: number;
        weeksWithData: number;
        met: boolean;
      };
      checkUp: { count: number; required: number; met: boolean };
    };
