import { createHash } from "crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  startPresentation,
  getPresentationResult,
  walletFetchedRequest,
  pidFromSdJwt,
  PID_SD_JWT_QUERY,
  PID_MDOC_QUERY,
} from "@/lib/eudi-verifier";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const b64 = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
const digest = (d: string) =>
  createHash("sha256").update(d).digest("base64url");

/**
 * An SD-JWT VC presentation shaped like the EUDI PID: the name as top-level
 * disclosures, "18" as a disclosure nested in `age_equal_or_over`. The
 * signature part is a placeholder; the verifier backend checks signatures.
 */
function sdJwtPid(
  claims: { given: string; family: string; over18: boolean },
  extra: string[] = [],
): string {
  const given = b64(["s1", "given_name", claims.given]);
  const family = b64(["s2", "family_name", claims.family]);
  const over18 = b64(["s3", "18", claims.over18]);
  const payload = {
    vct: "urn:eudi:pid:1",
    _sd_alg: "sha-256",
    _sd: [digest(given), digest(family)],
    age_equal_or_over: { _sd: [digest(over18)] },
  };
  const jwt = `${b64({ alg: "ES256" })}.${b64(payload)}.sig`;
  return [jwt, given, family, over18, ...extra, "kb.jwt.sig"].join("~");
}

function okJson(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

describe("startPresentation", () => {
  it("asks for the PID as SD-JWT VC or mdoc, encrypted, under HAIP (#708)", async () => {
    const fetchMock = vi.fn(async () =>
      okJson({
        transaction_id: "tx1",
        client_id: "x509_hash:abc",
        request_uri: "https://verifier.eudiw.dev/req/abc",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await startPresentation("nonce123");

    expect(r.transactionId).toBe("tx1");
    expect(r.walletLink).toContain("openid4vp://?");
    expect(r.walletLink).toContain("client_id=");
    expect(r.walletLink).toContain(
      encodeURIComponent("https://verifier.eudiw.dev/req/abc"),
    );

    const [url, opts] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/ui/presentations");
    const body = JSON.parse(opts.body as string);
    const [sd, mdoc] = body.dcql_query.credentials;
    expect(sd).toMatchObject({
      id: PID_SD_JWT_QUERY,
      format: "dc+sd-jwt",
      meta: { vct_values: ["urn:eudi:pid:1"] },
    });
    expect(mdoc).toMatchObject({
      id: PID_MDOC_QUERY,
      format: "mso_mdoc",
      meta: { doctype_value: "eu.europa.ec.eudi.pid.1" },
    });
    expect(body.dcql_query.credential_sets[0].options).toEqual([
      [PID_SD_JWT_QUERY],
      [PID_MDOC_QUERY],
    ]);
    // only the name: no birth date (#475), no age (outside TEST-01's registration)
    for (const c of body.dcql_query.credentials) {
      expect(c.claims.map((cl: { path: string[] }) => cl.path.at(-1))).toEqual([
        "family_name",
        "given_name",
      ]);
    }
    expect(JSON.stringify(body.dcql_query)).not.toMatch(/birth|age_/);
    expect(body.nonce).toBe("nonce123");
    expect(body.response_mode).toBe("direct_post.jwt");
    expect(body.profile).toBe("haip");
    expect(body.intended_use_id).toBe("TEST-01");
    expect(body.registration_certificate).toBeUndefined();
  });

  it("asks for the German PID type when the deployment names it (d-you)", async () => {
    vi.stubEnv("EUDI_PID_VCT", "urn:eudi:pid:de:1");
    const fetchMock = vi.fn(async () =>
      okJson({ transaction_id: "t", request_uri: "https://v/r" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await startPresentation("n");
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.dcql_query.credentials[0].meta.vct_values).toEqual([
      "urn:eudi:pid:de:1",
    ]);
  });

  it("asks for SD-JWT VC only when the registration covers nothing else (#708)", async () => {
    vi.stubEnv("EUDI_PID_FORMATS", "dc+sd-jwt");
    vi.stubEnv("EUDI_PID_VCT", "urn:eudi:pid:de:1");
    const fetchMock = vi.fn(async () =>
      okJson({ transaction_id: "t", request_uri: "https://v/r" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await startPresentation("n");
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.dcql_query.credentials).toHaveLength(1);
    expect(body.dcql_query.credentials[0]).toMatchObject({
      id: PID_SD_JWT_QUERY,
      format: "dc+sd-jwt",
      meta: { vct_values: ["urn:eudi:pid:de:1"] },
    });
    expect(body.dcql_query.credential_sets[0].options).toEqual([
      [PID_SD_JWT_QUERY],
    ]);
  });

  describe("the birth date, only where the registration names it (ADR-067, eIDAS Art. 5b(3))", () => {
    async function claimsAsked(): Promise<string[][]> {
      const fetchMock = vi.fn(async () =>
        okJson({ transaction_id: "t", request_uri: "https://v/r" }),
      );
      vi.stubGlobal("fetch", fetchMock);
      await startPresentation("n");
      const body = JSON.parse(
        (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
          .body as string,
      );
      return body.dcql_query.credentials.map(
        (c: { claims: { path: string[] }[] }) =>
          c.claims.map((cl) => cl.path.join("/")),
      );
    }

    it("asks for the name only without EUDI_PID_BIRTHDATE", async () => {
      vi.stubEnv("EUDI_PID_BIRTHDATE", "");
      expect(await claimsAsked()).toEqual([
        ["family_name", "given_name"],
        [
          "eu.europa.ec.eudi.pid.1/family_name",
          "eu.europa.ec.eudi.pid.1/given_name",
        ],
      ]);
      vi.stubEnv("EUDI_PID_BIRTHDATE", "yes");
      expect(JSON.stringify(await claimsAsked())).not.toMatch(/birth/);
    });

    it("asks for birthdate (SD-JWT) and birth_date (mdoc) with EUDI_PID_BIRTHDATE=true", async () => {
      vi.stubEnv("EUDI_PID_BIRTHDATE", "true");
      expect(await claimsAsked()).toEqual([
        ["family_name", "given_name", "birthdate"],
        [
          "eu.europa.ec.eudi.pid.1/family_name",
          "eu.europa.ec.eudi.pid.1/given_name",
          "eu.europa.ec.eudi.pid.1/birth_date",
        ],
      ]);
    });

    it("asks for the German PID's birthdate as SD-JWT VC only, as d-you's certificate covers", async () => {
      vi.stubEnv("EUDI_PID_BIRTHDATE", "true");
      vi.stubEnv("EUDI_PID_FORMATS", "dc+sd-jwt");
      vi.stubEnv("EUDI_PID_VCT", "urn:eudi:pid:de:1");
      expect(await claimsAsked()).toEqual([
        ["family_name", "given_name", "birthdate"],
      ]);
    });
  });

  it("falls back to mdoc rather than an empty request when no format is valid", async () => {
    vi.stubEnv("EUDI_PID_FORMATS", "jwt_vc");
    const fetchMock = vi.fn(async () =>
      okJson({ transaction_id: "t", request_uri: "https://v/r" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await startPresentation("n");
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(
      body.dcql_query.credentials.map((c: { id: string }) => c.id),
    ).toEqual([PID_MDOC_QUERY]);
  });

  it("sends our own registration certificate instead of the test intended use", async () => {
    vi.stubEnv("EUDI_REGISTRATION_CERTIFICATE", "eyJ.rp.cert");
    const fetchMock = vi.fn(async () =>
      okJson({ transaction_id: "t", request_uri: "https://v/r" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await startPresentation("n");
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.registration_certificate).toBe("eyJ.rp.cert");
    expect(body.intended_use_id).toBeUndefined();
  });

  it("falls back to presentation_id when transaction_id is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okJson({ presentation_id: "p1", request_uri: "https://v/r" }),
      ),
    );
    const r = await startPresentation("n");
    expect(r.transactionId).toBe("p1");
  });

  it("throws when the verifier returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" })),
    );
    await expect(startPresentation("n")).rejects.toThrow(
      /verifier init failed: 500/,
    );
  });

  it("throws when transaction_id or request_uri is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ client_id: "x" })),
    );
    await expect(startPresentation("n")).rejects.toThrow(
      /missing transaction_id/,
    );
  });
});

describe("getPresentationResult", () => {
  it("returns pending on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 404, ok: false })),
    );
    expect(await getPresentationResult("tx")).toEqual({ status: "pending" });
  });

  it("returns pending while the verifier says the wallet has not submitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ error: "PresentationNotSubmitted" }, 400)),
    );
    expect(await getPresentationResult("tx")).toEqual({ status: "pending" });
  });

  it("returns pending when vp_token is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({})),
    );
    expect(await getPresentationResult("tx")).toEqual({ status: "pending" });
  });

  it("reads the PID from an SD-JWT VC presentation", async () => {
    const vp = sdJwtPid({ given: "Maria", family: "Schmidt", over18: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ vp_token: { [PID_SD_JWT_QUERY]: [vp] } })),
    );
    expect(await getPresentationResult("tx")).toEqual({
      status: "completed",
      pid: { givenName: "Maria", familyName: "Schmidt", ageOver18: true },
    });
  });

  it("reads the PID from an mdoc through the verifier's validation utility", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/utilities/validations/msoMdoc/deviceResponse")
        ? okJson([
            {
              docType: "eu.europa.ec.eudi.pid.1",
              attributes: {
                "eu.europa.ec.eudi.pid.1": {
                  given_name: "Jan",
                  family_name: "de Vries",
                  age_over_18: true,
                },
              },
            },
          ])
        : okJson({ vp_token: { [PID_MDOC_QUERY]: ["o2d2ZXJzaW9u"] } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await getPresentationResult("tx")).toEqual({
      status: "completed",
      pid: { givenName: "Jan", familyName: "de Vries", ageOver18: true },
    });
    const [, opts] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(opts.body)).toBe("device_response=o2d2ZXJzaW9u");
  });

  it("fails when the validation utility refuses the mdoc", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/utilities/")
          ? okJson({ type: "InvalidDocuments" }, 400)
          : okJson({ vp_token: { [PID_MDOC_QUERY]: ["bad"] } }),
      ),
    );
    expect(await getPresentationResult("tx")).toEqual({
      status: "failed",
      reason: "the PID could not be read",
    });
  });

  it("fails when the wallet declined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ error: "access_denied" })),
    );
    expect(await getPresentationResult("tx")).toEqual({
      status: "failed",
      reason: "wallet: access_denied",
    });
  });

  it("fails when the response holds no PID query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ vp_token: { other: ["x"] } })),
    );
    expect((await getPresentationResult("tx")).status).toBe("failed");
  });

  it("throws on a non-404 error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({}, 500)),
    );
    await expect(getPresentationResult("tx")).rejects.toThrow(
      /verifier poll failed: 500/,
    );
  });
});

describe("pidFromSdJwt", () => {
  it("rebuilds the nested age claim from its disclosure", () => {
    const pid = pidFromSdJwt(
      sdJwtPid({ given: "Ana", family: "Núñez", over18: false }),
    );
    expect(pid).toEqual({
      givenName: "Ana",
      familyName: "Núñez",
      ageOver18: false,
    });
  });

  it("refuses a disclosure the issuer did not sign", () => {
    const forged = b64(["s9", "family_name", "Schmidt"]);
    expect(
      pidFromSdJwt(
        sdJwtPid({ given: "Eve", family: "Other", over18: true }, [forged]),
      ),
    ).toBeNull();
  });

  it("returns only what was disclosed", () => {
    const vp = sdJwtPid({ given: "Maria", family: "Schmidt", over18: true });
    const [jwt, given, , , kb] = vp.split("~");
    expect(pidFromSdJwt([jwt, given, kb].join("~"))).toEqual({
      givenName: "Maria",
    });
  });

  it("returns null for something that is not an SD-JWT", () => {
    expect(pidFromSdJwt("not-a-jwt")).toBeNull();
  });
});

describe("walletFetchedRequest (#708)", () => {
  it("is true once the verifier logged the wallet fetching the request", async () => {
    const fetchMock = vi.fn(async () =>
      okJson({
        events: [
          { actor: "Verifier", event: "Transaction initialized" },
          { actor: "Wallet", event: "Request object retrieved" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await walletFetchedRequest("tx 1")).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://verifier-backend.eudiw.dev/ui/presentations/tx%201/events",
    );
  });

  it("is false while only the verifier has acted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okJson([{ actor: "Verifier", event: "Transaction initialized" }]),
      ),
    );
    expect(await walletFetchedRequest("tx")).toBe(false);
  });

  it("is false when the event log cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({}, 404)),
    );
    expect(await walletFetchedRequest("tx")).toBe(false);
  });
});

describe("pidFromSdJwt reads the birth date for the secure hash (ADR-067)", () => {
  function withBirthDate(birthdate: unknown, signed = true): string {
    const given = b64(["s1", "given_name", "ERIKA"]);
    const family = b64(["s2", "family_name", "MUSTERMANN"]);
    const birth = b64(["s3", "birthdate", birthdate]);
    const payload = {
      vct: "urn:eudi:pid:de:1",
      _sd_alg: "sha-256",
      _sd: [digest(given), digest(family), ...(signed ? [digest(birth)] : [])],
    };
    const jwt = `${b64({ alg: "ES256" })}.${b64(payload)}.sig`;
    return [jwt, given, family, birth, "kb.jwt.sig"].join("~");
  }

  it("takes a disclosed birthdate", () => {
    expect(pidFromSdJwt(withBirthDate("1964-08-12"))).toMatchObject({
      givenName: "ERIKA",
      familyName: "MUSTERMANN",
      birthDate: "1964-08-12",
    });
  });

  it("keeps the rulebook's 00 for an unknown day", () => {
    expect(pidFromSdJwt(withBirthDate("1964-08-00"))?.birthDate).toBe(
      "1964-08-00",
    );
  });

  it("ignores a birthdate that is not a date", () => {
    expect(
      pidFromSdJwt(withBirthDate("12.08.1964"))?.birthDate,
    ).toBeUndefined();
  });

  it("refuses a birthdate disclosure the issuer did not sign", () => {
    expect(pidFromSdJwt(withBirthDate("1964-08-12", false))).toBeNull();
  });
});
