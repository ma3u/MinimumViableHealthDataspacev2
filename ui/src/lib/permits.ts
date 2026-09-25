/**
 * Shared vocabulary of the data permit workflow, Regulation (EU) 2025/327.
 * Used by the applications and permits routes and by the compliance page.
 */

/** Art. 68(4): the access body decides within three months. */
export const DECISION_MONTHS = 3;

/** Art. 68(4): the body may extend the three months once, by three, with reasons. */
export const EXTENSION_MONTHS = 3;

/** Art. 68(4): an incomplete application is completed within four weeks. */
export const COMPLETION_WEEKS = 4;

/** Art. 57(1)(j)(iii): decisions are published within 30 working days. */
export const PUBLISH_WORKING_DAYS = 30;

/** Art. 61(4): results are communicated within 18 months of the end of processing. */
export const RESULTS_MONTHS = 18;

/** The Art. 53(1) purposes a permit may be issued for. */
export const PURPOSES = [
  "PUBLIC_HEALTH",
  "POLICY_MAKING",
  "STATISTICS",
  "EDUCATION",
  "SCIENTIFIC_RESEARCH",
  "CARE_IMPROVEMENT",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABELS: Record<Purpose, string> = {
  PUBLIC_HEALTH: "(a) public interest in public or occupational health",
  POLICY_MAKING: "(b) policymaking and regulatory activities",
  STATISTICS: "(c) official statistics",
  EDUCATION: "(d) education or teaching",
  SCIENTIFIC_RESEARCH: "(e) scientific research",
  CARE_IMPROVEMENT: "(f) improvement of the delivery of care",
};

/** Art. 68(1)(a) to (h): what the body assesses before it issues a permit. */
export const CRITERIA = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERIA_LABELS: Record<Criterion, string> = {
  a: "The purposes correspond to Art. 53(1)",
  b: "The data are necessary, adequate and proportionate (Art. 66)",
  c: "Processing is lawful under GDPR Art. 6(1); pseudonymised data are justified",
  d: "The applicant is qualified for the intended purposes",
  e: "Technical and organisational measures against misuse are sufficient",
  f: "The ethics assessment complies with national law",
  g: "An Art. 71(4) exception, where used, is justified",
  h: "All other requirements of Chapter IV are met",
};

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

/** Working days: weekends skipped, public holidays not. */
export function addWorkingDays(d: Date, days: number): Date {
  const r = new Date(d);
  let left = days;
  while (left > 0) {
    r.setUTCDate(r.getUTCDate() + 1);
    const wd = r.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return r;
}

/** Neo4j prints nine fractional digits; Date.parse wants at most three. */
export function parseGraphTime(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const t = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(t) ? null : t;
}

/**
 * The Art. 68(4) clock for one application: when the decision is due and how
 * many days remain (negative once overdue). Null when nothing is pending.
 */
export function decisionClock(
  submittedAt: string | null | undefined,
  undecided: boolean,
  now = Date.now(),
): { decisionDue: string | null; daysToDecision: number | null } {
  const submitted = parseGraphTime(submittedAt);
  if (submitted === null) return { decisionDue: null, daysToDecision: null };
  const due = addMonths(new Date(submitted), DECISION_MONTHS);
  return {
    decisionDue: due.toISOString(),
    daysToDecision: undecided
      ? Math.ceil((due.getTime() - now) / 86_400_000)
      : null,
  };
}

/* ── The eleven items of an application, Art. 67(2) ─────────────── */

/** Pseudonymised or anonymised (Art. 67(2)(e)). */
export const IDENTIFIABILITY = ["PSEUDONYMISED", "ANONYMISED"] as const;
export type Identifiability = (typeof IDENTIFIABILITY)[number];

/**
 * The applicant's category for the fee (Art. 62(3): reduced fees for public
 * sector bodies, academic researchers and micro-enterprises).
 */
export const APPLICANT_CATEGORIES = [
  "PUBLIC_SECTOR",
  "ACADEMIC",
  "MICRO_ENTERPRISE",
  "COMMERCIAL",
] as const;
export type ApplicantCategory = (typeof APPLICANT_CATEGORIES)[number];

export const APPLICANT_CATEGORY_LABELS: Record<ApplicantCategory, string> = {
  PUBLIC_SECTOR: "public sector body or Union institution",
  ACADEMIC: "university or academic researcher",
  MICRO_ENTERPRISE: "micro-enterprise",
  COMMERCIAL: "other legal person",
};

/** What an application carries; every field null when the applicant left it out. */
export interface ApplicationItems {
  namedPersons?: string | null;
  requestedPurpose?: string | null;
  intendedUse?: string | null;
  requestedData?: string | null;
  dataTimeRange?: string | null;
  dataFormats?: string | null;
  identifiability?: string | null;
  pseudonymisationJustification?: string | null;
  datasetsBroughtIn?: string | null;
  safeguards?: string | null;
  processingPeriodMonths?: number | null;
  speTools?: string | null;
  ethicsCommitteeRef?: string | null;
  art71Exception?: boolean | null;
  art71ExceptionJustification?: string | null;
}

export const APPLICATION_ITEMS = [
  {
    item: "a",
    label: "Applicant and the natural persons who will access the data",
    fields: ["namedPersons"],
  },
  { item: "b", label: "Purpose, Art. 53(1)", fields: ["requestedPurpose"] },
  {
    item: "c",
    label: "Intended use and the expected benefit",
    fields: ["intendedUse"],
  },
  {
    item: "d",
    label: "Requested data: scope, time range, format, sources and coverage",
    fields: ["requestedData", "dataTimeRange", "dataFormats"],
  },
  {
    item: "e",
    label: "Pseudonymised or anonymised, with the reasons for pseudonymised",
    fields: ["identifiability"],
  },
  {
    item: "f",
    label: "Datasets the applicant brings in",
    fields: ["datasetsBroughtIn"],
  },
  {
    item: "g",
    label: "Safeguards against misuse and re-identification",
    fields: ["safeguards"],
  },
  {
    item: "h",
    label: "Period of processing",
    fields: ["processingPeriodMonths"],
  },
  {
    item: "i",
    label: "Tools and computing resources in the secure processing environment",
    fields: ["speTools"],
  },
  { item: "j", label: "Ethics assessment", fields: ["ethicsCommitteeRef"] },
  {
    item: "k",
    label: "Whether an Art. 71(4) exception is invoked, and why",
    fields: ["art71Exception"],
  },
] as const;

export type ApplicationItem = (typeof APPLICATION_ITEMS)[number]["item"];

function filled(v: unknown): boolean {
  return typeof v === "string" ? v.trim().length > 0 : false;
}

/** Whether one Art. 67(2) item is present on the application. */
export function hasApplicationItem(
  app: ApplicationItems,
  item: ApplicationItem,
): boolean {
  switch (item) {
    case "a":
      return filled(app.namedPersons);
    case "b":
      return (PURPOSES as readonly string[]).includes(
        app.requestedPurpose ?? "",
      );
    case "c":
      return filled(app.intendedUse);
    case "d":
      return (
        filled(app.requestedData) &&
        filled(app.dataTimeRange) &&
        filled(app.dataFormats)
      );
    case "e":
      return (
        (IDENTIFIABILITY as readonly string[]).includes(
          app.identifiability ?? "",
        ) &&
        (app.identifiability !== "PSEUDONYMISED" ||
          filled(app.pseudonymisationJustification))
      );
    case "f":
      return filled(app.datasetsBroughtIn);
    case "g":
      return filled(app.safeguards);
    case "h":
      return (
        typeof app.processingPeriodMonths === "number" &&
        app.processingPeriodMonths > 0
      );
    case "i":
      return filled(app.speTools);
    case "j":
      return filled(app.ethicsCommitteeRef);
    case "k":
      return (
        typeof app.art71Exception === "boolean" &&
        (!app.art71Exception || filled(app.art71ExceptionJustification))
      );
  }
}

export interface Completeness {
  complete: boolean;
  present: number;
  total: number;
  missing: { item: ApplicationItem; label: string }[];
}

/** Which of the eleven items an application carries (Art. 67(2)). */
export function applicationCompleteness(app: ApplicationItems): Completeness {
  const missing = APPLICATION_ITEMS.filter(
    (i) => !hasApplicationItem(app, i.item),
  ).map((i) => ({ item: i.item, label: i.label }));
  return {
    complete: missing.length === 0,
    present: APPLICATION_ITEMS.length - missing.length,
    total: APPLICATION_ITEMS.length,
    missing,
  };
}

/* ── The Art. 68(4) clock with its pause and its extension ───────── */

export interface ClockInput {
  submittedAt?: string | null;
  /** When a complete application was received, if it was incomplete first. */
  completedAt?: string | null;
  /** The one extension by three months, with reasons. */
  extendedAt?: string | null;
  /** The notice that the application is incomplete. */
  incompleteNoticeAt?: string | null;
  completeBy?: string | null;
}

export type ClockState = "none" | "running" | "extended" | "paused" | "decided";

export interface ApplicationClock {
  decisionDue: string | null;
  daysToDecision: number | null;
  clockState: ClockState;
  completeBy: string | null;
  daysToComplete: number | null;
  extended: boolean;
}

/**
 * The Art. 68(4) clock for one application. Three months run from the
 * receipt of a complete application; a notice of incompleteness stops them
 * and gives the applicant four weeks; completing restarts them; the body may
 * extend once by three months with reasons.
 */
export function applicationClock(
  app: ClockInput,
  undecided: boolean,
  now = Date.now(),
): ApplicationClock {
  const submitted = parseGraphTime(app.submittedAt);
  const completed = parseGraphTime(app.completedAt);
  const notice = parseGraphTime(app.incompleteNoticeAt);
  const extended = parseGraphTime(app.extendedAt) !== null;
  const none: ApplicationClock = {
    decisionDue: null,
    daysToDecision: null,
    clockState: "none",
    completeBy: null,
    daysToComplete: null,
    extended,
  };
  if (submitted === null) return none;

  const paused =
    undecided && notice !== null && (completed === null || completed < notice);
  if (paused) {
    const by =
      parseGraphTime(app.completeBy) ??
      notice + COMPLETION_WEEKS * 7 * 86_400_000;
    return {
      ...none,
      clockState: "paused",
      completeBy: new Date(by).toISOString(),
      daysToComplete: Math.ceil((by - now) / 86_400_000),
    };
  }

  const start =
    completed !== null && completed > submitted ? completed : submitted;
  const due = addMonths(
    new Date(start),
    DECISION_MONTHS + (extended ? EXTENSION_MONTHS : 0),
  );
  return {
    ...none,
    decisionDue: due.toISOString(),
    daysToDecision: undecided
      ? Math.ceil((due.getTime() - now) / 86_400_000)
      : null,
    clockState: undecided ? (extended ? "extended" : "running") : "decided",
  };
}
