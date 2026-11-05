import { birthYear, patientPseudonym } from "@/lib/patient-identity";

/**
 * Reading the data a STARTED HttpData-PULL transfer gives access to (#876).
 *
 * With EDC 0.18 the consumer's control plane hands the data flow to its
 * siglet, which keeps the provider's access token for it. The consumer asks
 * its siglet for the token, then calls the provider's data plane with it. The
 * token API answers only inside the environment (internal ingress, auth off
 * as on compose, scripts/azure/17-siglet.sh); the hub calls it server side and
 * never hands the token to the browser.
 *
 * The data endpoint is the one siglet puts in the transfer's data address for
 * HttpData-PULL (jad/siglet.toml, `endpoint`); the token API returns only the
 * token, so the hub is told the endpoint the same way.
 */
const SIGLET_TOKEN_URL = process.env.SIGLET_TOKEN_URL || "http://siglet:8080";
const EDR_DATA_URL =
  process.env.EDR_DATA_URL || "http://dataplane-fhir:8186/api/data";

/** Larger answers are cut off rather than streamed into the page. */
const MAX_BYTES = 5_000_000;

/** Siglet accepts these characters in a participant context or flow id. */
const PLAIN_ID = /^[A-Za-z0-9._:@~-]{1,256}$/;

export function isPlainId(id: string): boolean {
  return PLAIN_ID.test(id) && id !== "." && id !== "..";
}

/** Which step failed, so the page can say where the pull stopped. */
export class TransferDataError extends Error {
  constructor(
    readonly step: "token" | "data",
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * The access token siglet holds for this flow. The flow id is the consumer's
 * transfer process id; the correlation id is tried after it, since the
 * control plane may key the flow by either.
 */
export async function flowToken(
  participantContextId: string,
  flowIds: string[],
): Promise<string> {
  let last = "";
  for (const flowId of flowIds.filter(isPlainId)) {
    const res = await fetch(
      `${SIGLET_TOKEN_URL}/tokens/${participantContextId}/${flowId}`,
      { cache: "no-store" },
    ).catch((err: unknown) => {
      throw new TransferDataError(
        "token",
        `siglet at ${SIGLET_TOKEN_URL} did not answer: ${String(err)}`,
      );
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { token?: string };
      if (body.token) return body.token;
      last = "siglet answered without a token";
      continue;
    }
    last = `siglet answered ${res.status} for flow ${flowId}`;
    if (res.status !== 404) break;
  }
  throw new TransferDataError(
    "token",
    last || "no flow id to ask siglet for",
    404,
  );
}

export interface PulledData {
  contentType: string;
  bytes: number;
  truncated: boolean;
  data: unknown;
}

/**
 * What a refusal from the data plane means, for the person reading it.
 * Measured on Azure on 2026-11-05: a token a few minutes old is accepted and
 * answered 404, because the data plane there is JAD's certificate demo
 * (`/api/data/certs/...`) and serves no asset's data; a token two hours old
 * is answered 401, as siglet did not renew it (#876).
 */
function dataPlaneRefusal(status: number | undefined): string {
  if (status === 401 || status === 403) {
    return `the data plane refused the access token (${status}); it has expired or was revoked, so start a new transfer`;
  }
  if (status === 404) {
    return `the data plane at ${EDR_DATA_URL} accepted the token but serves no data for this asset (404); on this deployment it is JAD's certificate demo, not a data plane for FHIR assets`;
  }
  return `the data plane answered ${status ?? "nothing"}`;
}

/** GET the data endpoint with the token, as a bare token and then as Bearer. */
export async function pullData(token: string): Promise<PulledData> {
  let res: Response | null = null;
  for (const authorization of [token, `Bearer ${token}`]) {
    res = await fetch(EDR_DATA_URL, {
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
    }).catch((err: unknown) => {
      throw new TransferDataError(
        "data",
        `the data plane at ${EDR_DATA_URL} did not answer: ${String(err)}`,
      );
    });
    if (res.status !== 401 && res.status !== 403) break;
  }
  if (!res || !res.ok) {
    throw new TransferDataError(
      "data",
      dataPlaneRefusal(res?.status),
      res?.status,
    );
  }

  const text = await res.text();
  const truncated = text.length > MAX_BYTES;
  const kept = truncated ? text.slice(0, MAX_BYTES) : text;
  const contentType = res.headers.get("content-type") || "";
  let data: unknown = kept;
  if (!truncated) {
    try {
      data = JSON.parse(kept);
    } catch {
      // Not JSON: hand it on as text.
    }
  }
  return { contentType, bytes: text.length, truncated, data };
}

/**
 * FHIR data as a role without identity may see it (#475): every Patient
 * resource keeps gender and birth year; name, contact details, address and
 * identifiers go, and its id becomes the hub's pseudonym, in the resource and
 * in every `Patient/<id>` reference that points at it.
 */
export function pseudonymiseFhir(data: unknown): unknown {
  const ids = new Map<string, string>();
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(collect);
    if (!node || typeof node !== "object") return;
    const r = node as Record<string, unknown>;
    if (r.resourceType === "Patient" && typeof r.id === "string") {
      ids.set(r.id, patientPseudonym(r.id).replace("Patient ", "p-"));
    }
    Object.values(r).forEach(collect);
  };
  collect(data);

  const rewrite = (node: unknown): unknown => {
    if (typeof node === "string") {
      // A relative reference or a fullUrl ending in one.
      const m = /^(.*\bPatient\/)([^/?#]+)$/.exec(node);
      return m && ids.has(m[2]) ? `${m[1]}${ids.get(m[2])}` : node;
    }
    if (Array.isArray(node)) return node.map(rewrite);
    if (!node || typeof node !== "object") return node;
    const r = node as Record<string, unknown>;
    if (r.resourceType === "Patient") {
      const out: Record<string, unknown> = { resourceType: "Patient" };
      if (typeof r.id === "string") out.id = ids.get(r.id) ?? r.id;
      if (r.gender !== undefined) out.gender = r.gender;
      const year = birthYear(r.birthDate);
      if (year) out.birthDate = year;
      return out;
    }
    return Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, rewrite(v)]),
    );
  };
  return rewrite(data);
}
