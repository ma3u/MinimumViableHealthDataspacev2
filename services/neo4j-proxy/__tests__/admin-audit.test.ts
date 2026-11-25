import { describe, it, expect } from "vitest";
import { adminAuditInput, buildAdminAuditEvent } from "../src/admin-audit.js";

describe("admin audit events (#1236, draft SPE act Art. 16(3)(c), (f))", () => {
  it("accepts a known action and rejects anything else", () => {
    expect(
      adminAuditInput({
        event: "spe-stop",
        outcome: "success",
        actorId: "admin@health-dataspace.local",
        actorRole: "EDC_ADMIN",
        target: "SPE-1",
      }),
    ).toMatchObject({ event: "spe-stop", target: "SPE-1" });
    expect(
      adminAuditInput({
        event: "drop-database",
        outcome: "success",
        actorId: "x",
        actorRole: "EDC_ADMIN",
        target: "SPE-1",
      }),
    ).toBeNull();
    expect(
      adminAuditInput({
        event: "permit-revoke",
        outcome: "success",
        actorId: "x",
        actorRole: "PATIENT",
        target: "p",
      }),
    ).toBeNull();
  });

  it("writes a FHIR AuditEvent naming who acted on what, and nothing else", () => {
    const r = buildAdminAuditEvent(
      {
        event: "permit-revoke",
        outcome: "success",
        actorId: "regulator@health-dataspace.local",
        actorRole: "HDAB_AUTHORITY",
        target: "hdab-medreg-pharmaco-2026-001",
        detail: "REVOKED",
        reason: "Breach of the permit's conditions",
      },
      { id: "e1", recorded: "2026-11-24T12:00:00Z" },
    );
    expect(r.resourceType).toBe("AuditEvent");
    expect(r.action).toBe("U");
    expect(r.outcome).toBe("0");
    expect((r.subtype as Array<{ code: string }>)[0].code).toBe(
      "permit-revoke",
    );
    expect(JSON.stringify(r)).toContain("hdab-medreg-pharmaco-2026-001");
    expect(r.outcomeDesc).toBe("Breach of the permit's conditions");
  });
});
