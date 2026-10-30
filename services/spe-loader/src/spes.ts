// ---------------------------------------------------------------------------
// The two secure processing environments and what each one holds (ADR-069)
// ---------------------------------------------------------------------------
//
// Both workspaces are loaded from the hub graph's synthetic patients, ordered
// by coalesce(resourceId, id, elementId): SPE-1 (AlphaKlinik Berlin) takes the
// first half, SPE-2 (Limburg Medical Centre) the second, the split that
// scripts/seed-spe2.py made before (SPE-2 = ids[size / 2..] in Cypher, integer
// division). The two never share a patient.

export type SpeNumber = 1 | 2;
export type SpeId = "SPE-1" | "SPE-2";

export interface SpeDefinition {
  n: SpeNumber;
  id: SpeId;
  holder: string;
  holderDid: string;
  half: "first" | "second";
  /** HealthDCAT-AP registration applied to the workspace after the load. */
  registration: string;
}

export const SPES: Record<SpeNumber, SpeDefinition> = {
  1: {
    n: 1,
    id: "SPE-1",
    holder: "AlphaKlinik Berlin",
    holderDid: "did:web:alpha-klinik.de:participant",
    half: "first",
    registration: "neo4j/register-fhir-dataset-hdcatap-spe1.cypher",
  },
  2: {
    n: 2,
    id: "SPE-2",
    holder: "Limburg Medical Centre",
    holderDid: "did:web:lmc.nl:clinic",
    half: "second",
    registration: "neo4j/register-fhir-dataset-hdcatap-spe2.cypher",
  },
};

export function speByNumber(value: string | number): SpeDefinition {
  const n = Number(String(value).replace(/^spe-?/i, ""));
  if (n !== 1 && n !== 2) throw new Error(`unknown SPE '${value}' (1 or 2)`);
  return SPES[n];
}

/** The Trustee resource that holds an SPE's extract key. */
export function keyPath(n: SpeNumber): string {
  return `default/spe-${n}/extract-key`;
}

/**
 * The half of the eligible patients an SPE holds. `sorted` is already in
 * the hub's order; floor(n / 2) is Cypher's integer division, so an odd
 * count gives SPE-2 the extra patient, as seed-spe2.py did.
 */
export function selectHalf<T>(
  sorted: readonly T[],
  half: "first" | "second",
): T[] {
  const cut = Math.floor(sorted.length / 2);
  return half === "first" ? sorted.slice(0, cut) : sorted.slice(cut);
}
