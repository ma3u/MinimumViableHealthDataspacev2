import type { SpeAuditEvent } from "@/lib/spe";

/**
 * Reads an SPE event of #774 off an (:AuditEvent) of the ADR-045 chain.
 *
 * The proxy writes the events (WP1); #774 fixes their types and fields
 * (`speId`, `permitId`, `policyHash`, `teeType`, `attestationScope`,
 * `simulated`) but not where on the node they sit. This takes a field from
 * the node when it is a property there, else from the FHIR AuditEvent in
 * `resource`: an `entity[].detail[]` entry of that name, and the event type
 * from a `subtype` code or an `eventType` detail.
 */

type Row = Record<string, unknown>;

interface FhirDetail {
  type?: string;
  valueString?: string;
  valueBoolean?: boolean;
}

function parseResource(raw: unknown): Row | null {
  if (raw && typeof raw === "object") return raw as Row;
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Row) : null;
  } catch {
    return null;
  }
}

function resourceDetails(resource: Row | null): Map<string, FhirDetail> {
  const out = new Map<string, FhirDetail>();
  const entities = Array.isArray(resource?.entity) ? resource.entity : [];
  for (const entity of entities as Row[]) {
    const details = Array.isArray(entity?.detail) ? entity.detail : [];
    for (const d of details as FhirDetail[]) {
      if (d && typeof d.type === "string" && !out.has(d.type)) {
        out.set(d.type, d);
      }
    }
  }
  return out;
}

function resourceEventType(resource: Row | null): string | null {
  const subtypes = Array.isArray(resource?.subtype) ? resource.subtype : [];
  for (const s of subtypes as Row[]) {
    if (typeof s?.code === "string" && s.code.startsWith("spe.")) {
      return s.code;
    }
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v !== "") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export function normaliseSpeEvent(row: Row): SpeAuditEvent | null {
  const resource = parseResource(row.resource);
  const details = resourceDetails(resource);
  const detail = (name: string): unknown => {
    const d = details.get(name);
    return d?.valueBoolean ?? d?.valueString;
  };
  const field = (name: string): unknown => row[name] ?? detail(name);

  const eventType =
    str(row.eventType) ??
    str(detail("eventType")) ??
    resourceEventType(resource);
  if (!eventType || !eventType.startsWith("spe.")) return null;

  return {
    id: str(row.id) ?? str(resource?.id) ?? `${eventType}-${str(row.recorded)}`,
    eventType,
    recorded: str(row.recorded) ?? str(resource?.recorded),
    speId: str(field("speId")),
    permitId: str(field("permitId")),
    policyHash: str(field("policyHash")),
    teeType: str(field("teeType")),
    attestationScope: str(field("attestationScope")),
    simulated: bool(field("simulated")),
    outcome: str(row.outcome) ?? str(detail("outcome")),
  };
}
