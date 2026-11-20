/**
 * Writes to a person's record are on the audit trail (ADR-045 plane 2,
 * #1173): the hub records every FHIR document import, taken or refused, as a
 * FHIR AuditEvent on the "record" chain, with no name and no health data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildRecordAuditEvent,
  recordAuditInput,
} from "../src/record-audit.js";

const appendRecordAudit = vi.fn();
vi.mock("../src/record-audit.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/record-audit.js")>()),
  appendRecordAudit: (...args: unknown[]) => appendRecordAudit(...args),
}));
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const { app } = await import("../src/index.js");
import supertest from "supertest";
const request = supertest(app);

const IMPORT = {
  event: "document-import",
  outcome: "success",
  patientId: "P1",
  actorId: "did:web:alpha-klinik.de:participant",
  actorRole: "DATA_HOLDER",
  documentId: "urn:ietf:rfc:3986|urn:uuid:0c9f3a52-1111-4c55-9d0e-8f1b2a7c4e19",
  documentType: "11502-2",
};

describe("record audit events", () => {
  it("name the record, the document and who imported it, nothing else", () => {
    const input = recordAuditInput({
      ...IMPORT,
      name: "Maria Schmidt",
      content: "{...}",
    });
    expect(input).toEqual(IMPORT);
    const event = buildRecordAuditEvent(input!, {
      id: "a1",
      recorded: "2026-11-20T09:00:00.000Z",
    });
    expect(event).toMatchObject({
      resourceType: "AuditEvent",
      action: "C",
      outcome: "0",
      subtype: [
        { system: "http://hl7.org/fhir/restful-interaction", code: "create" },
        { code: "document-import" },
      ],
      agent: [
        {
          who: { identifier: { value: "did:web:alpha-klinik.de:participant" } },
          role: [{ text: "DATA_HOLDER" }],
        },
        { who: { display: "mvhd-neo4j-proxy" } },
      ],
    });
    const entities = event.entity as { what: { identifier: unknown } }[];
    expect(entities.map((e) => e.what.identifier)).toEqual([
      { system: "https://ehds.mabu.red/fhir/sid/patient-record", value: "P1" },
      {
        system: "urn:ietf:rfc:3986",
        value: "urn:uuid:0c9f3a52-1111-4c55-9d0e-8f1b2a7c4e19",
      },
    ]);
    expect(JSON.stringify(event)).not.toContain("Maria");
  });

  it("record a refusal with its reason", () => {
    const event = buildRecordAuditEvent(
      {
        ...recordAuditInput(IMPORT)!,
        outcome: "refused",
        reason: "no Composition",
      },
      { id: "a2", recorded: "2026-11-20T09:00:00.000Z" },
    );
    expect(event.outcome).toBe("4");
    expect(event.outcomeDesc).toBe("no Composition");
  });

  it("refuse an event, role or record they do not know", () => {
    expect(
      recordAuditInput({ ...IMPORT, event: "delete-everything" }),
    ).toBeNull();
    expect(recordAuditInput({ ...IMPORT, actorRole: "DATA_USER" })).toBeNull();
    expect(recordAuditInput({ ...IMPORT, patientId: "" })).toBeNull();
    expect(recordAuditInput({ ...IMPORT, outcome: "maybe" })).toBeNull();
  });
});

describe("POST /audit/record", () => {
  beforeEach(() => {
    appendRecordAudit.mockReset();
  });

  it("appends the event and answers with its place in the chain", async () => {
    appendRecordAudit.mockResolvedValue({
      chain: "record",
      seq: 4,
      hash: "ab",
    });
    const res = await request.post("/audit/record").send(IMPORT);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ chain: "record", seq: 4, hash: "ab" });
    expect(appendRecordAudit).toHaveBeenCalledWith(IMPORT);
  });

  it("refuses what is not a record event", async () => {
    const res = await request.post("/audit/record").send({ event: "x" });
    expect(res.status).toBe(400);
    expect(appendRecordAudit).not.toHaveBeenCalled();
  });

  it("answers 503 when the record cannot be written, so the hub does not write", async () => {
    appendRecordAudit.mockRejectedValue(new Error("neo4j down"));
    const res = await request.post("/audit/record").send(IMPORT);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/ADR-045/);
  });
});
