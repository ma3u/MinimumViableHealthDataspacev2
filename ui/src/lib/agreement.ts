/**
 * A contract agreement as the transfer page shows it (#876): when it was
 * signed, until when it allows use, and the policy both parties agreed to.
 */

export interface AgreementView {
  agreementId: string;
  assetId: string;
  providerId: string;
  consumerId: string;
  /** ISO time the connectors signed it, or "" when the connector gives none. */
  signedAt: string;
  /** ISO time the agreed period ends, or "" when the policy sets none. */
  validUntil: string;
  policy: Record<string, unknown>;
}

const DAY_MS = 86_400_000;
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: DAY_MS,
  w: 7 * DAY_MS,
};

/** "inForceDate", "edc:inForceDate", or the full IRI, as its local name. */
function localName(v: unknown): string {
  const raw =
    typeof v === "string"
      ? v
      : v && typeof v === "object" && "@id" in v
        ? String((v as { "@id": unknown })["@id"])
        : "";
  return raw.split(/[:/#]/).pop() ?? "";
}

function value(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (v && typeof v === "object" && "@value" in v) {
    return String((v as { "@value": unknown })["@value"]);
  }
  return "";
}

function list(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  return v && typeof v === "object" ? [v as Record<string, unknown>] : [];
}

/**
 * The end of the period the policy allows, counted from the signing:
 * `contractAgreement+365d` is a year after it, a date is that date. Empty
 * when no permission sets an upper limit on inForceDate or dateTime.
 */
export function agreementValidUntil(
  policy: Record<string, unknown>,
  signedAtMs: number,
): string {
  for (const perm of list(policy.permission ?? policy["odrl:permission"])) {
    const constraints = list(perm.constraint ?? perm["odrl:constraint"]);
    for (const c of constraints) {
      const left = localName(c.leftOperand ?? c["odrl:leftOperand"]);
      const op = localName(c.operator ?? c["odrl:operator"]);
      if (!["inForceDate", "dateTime"].includes(left)) continue;
      if (!["lteq", "lt", "eq"].includes(op)) continue;
      const right = value(c.rightOperand ?? c["odrl:rightOperand"]).trim();
      const period = /^contractAgreement\s*\+\s*(\d+)\s*([smhdw])$/.exec(right);
      if (period && signedAtMs) {
        return new Date(
          signedAtMs + Number(period[1]) * UNIT_MS[period[2]],
        ).toISOString();
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(right)) {
        const d = new Date(right);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
    }
  }
  return "";
}

/** The connector's agreement in the shape the page reads. */
export function toAgreementView(raw: Record<string, unknown>): AgreementView {
  // EDC gives the signing time in seconds since the epoch.
  const signed = Number(raw.contractSigningDate ?? 0);
  const signedAtMs = signed > 0 && signed < 1e12 ? signed * 1000 : signed;
  const policy = (raw.policy ?? {}) as Record<string, unknown>;
  return {
    agreementId: String(raw["@id"] ?? ""),
    assetId: String(raw.assetId ?? ""),
    providerId: String(raw.providerId ?? ""),
    consumerId: String(raw.consumerId ?? ""),
    signedAt: signedAtMs ? new Date(signedAtMs).toISOString() : "",
    validUntil: agreementValidUntil(policy, signedAtMs),
    policy,
  };
}
