// ---------------------------------------------------------------------------
// The profiles the FHIR facade claims in meta.profile (#1144)
// ---------------------------------------------------------------------------
//
// A resource names a profile only when its class passed it: every resource of
// that class in the facade sample (scripts/eehrxf/samples/facade-sample.json)
// validated against the profile in scripts/eehrxf/validation-report.json,
// source `facade`. __tests__/fhir-profile-claims.test.ts fails when this
// table and the report disagree in either direction, so a claim that stops
// validating, or a profile that starts to, is a failing test rather than a
// silent difference.
//
// `category` narrows a claim the way validate.py's `sourceFilter` narrows the
// candidates for a profile: the lab Observation profile is tested on
// Observations of category `laboratory` only, so only those claim it.

export interface ProfileClaim {
  /** The profile's id in scripts/eehrxf/profiles.json */
  profileId: string;
  canonical: string;
  resourceType: string;
  /** A category code the resource must carry (validate.py's sourceFilter). */
  category?: string;
}

export const PROFILE_CLAIMS: readonly ProfileClaim[] = [
  {
    profileId: "patient-eu-core",
    canonical: "http://hl7.eu/fhir/base/StructureDefinition/patient-eu-core",
    resourceType: "Patient",
  },
  {
    profileId: "condition-eu-core",
    canonical: "http://hl7.eu/fhir/base/StructureDefinition/condition-eu-core",
    resourceType: "Condition",
  },
  {
    profileId: "medication-request-eu",
    canonical:
      "http://hl7.eu/fhir/mpd/StructureDefinition/MedicationRequest-eu-mpd",
    resourceType: "MedicationRequest",
  },
  {
    profileId: "observation-results-lab-eu",
    canonical:
      "http://hl7.eu/fhir/laboratory/StructureDefinition/Observation-resultslab-eu-lab",
    resourceType: "Observation",
    category: "laboratory",
  },
  {
    profileId: "encounter-hdr-eu",
    canonical: "http://hl7.eu/fhir/hdr/StructureDefinition/encounter-eu-hdr",
    resourceType: "Encounter",
  },
  // German profiles of the MII Kerndatensatz (profiles.json, national), by
  // the same rule: claimed where every facade resource of the class passed.
  {
    profileId: "kds-patient-de",
    canonical:
      "https://www.medizininformatik-initiative.de/fhir/core/modul-person/StructureDefinition/Patient",
    resourceType: "Patient",
  },
  {
    profileId: "kds-medication-request-de",
    canonical:
      "https://www.medizininformatik-initiative.de/fhir/core/modul-medikation/StructureDefinition/MedicationRequest",
    resourceType: "MedicationRequest",
  },
];

function categoryCodes(resource: Record<string, unknown>): string[] {
  const cats = resource.category;
  if (!Array.isArray(cats)) return [];
  return cats.flatMap((c) =>
    Array.isArray((c as { coding?: unknown })?.coding)
      ? (c as { coding: Array<{ code?: unknown }> }).coding
          .map((x) => x.code)
          .filter((x): x is string => typeof x === "string")
      : [],
  );
}

/** The canonicals of the profiles this resource claims. */
export function claimedProfiles(resource: Record<string, unknown>): string[] {
  return PROFILE_CLAIMS.filter(
    (c) =>
      c.resourceType === resource.resourceType &&
      (!c.category || categoryCodes(resource).includes(c.category)),
  ).map((c) => c.canonical);
}
