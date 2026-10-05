/**
 * No patient identifier, question, Cypher or credential reaches a log line
 * (runbook docs/knowledge/runbooks/cost-efficient-logging.md section 4,
 * ADR-045 plane 1, #418).
 *
 * The runbook's test, per Node service: a request carrying a token and a
 * patient id produces log output containing neither.
 */
import { Writable } from "node:stream";
import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import {
  createLogger,
  otlpLineStream,
  requestLogging,
  traceIdFrom,
} from "../src/logger.js";

const PATIENT_ID = "patient-4711-mueller";
const TOKEN = "eyJhbGciOiJSUzI1NiJ9.secret-token-value";
const QUESTION = "show me Erika Mustermann born 1964-08-12";
const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(...String(chunk).split("\n").filter(Boolean));
      done();
    },
  });
  // An explicit level: LOG_LEVEL in the environment must not silence the test.
  return { log: createLogger(stream, "info"), lines };
}

function appWith(log: ReturnType<typeof createLogger>) {
  const app = express();
  app.use(requestLogging(log));
  app.use(express.json());
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.post("/fhir/Patient/:id", (req, res) => {
    // A careless handler: the redaction must still hold.
    log.info(
      { patientId: req.params.id, question: req.body.question },
      "lookup",
    );
    log.error(
      { err: new Error(`Neo4j failed\nMATCH (p {id: '${req.params.id}'})`) },
      "query failed",
    );
    res.status(500).json({ error: "nope" });
  });
  return app;
}

describe("proxy logs", () => {
  it("carry neither the token nor the patient id nor the question", async () => {
    const { log, lines } = capture();
    await request(appWith(log))
      .post(`/fhir/Patient/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("Cookie", `__Secure-next-auth.session-token=${TOKEN}`)
      .set("traceparent", `00-${TRACE_ID}-00f067aa0ba902b7-01`)
      .send({ question: QUESTION });

    const output = lines.join("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(output).not.toContain(PATIENT_ID);
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain("Erika");
    expect(output).not.toContain("1964-08-12");
    expect(output).not.toContain("MATCH");
  });

  it("name the route pattern and the caller's trace id", async () => {
    const { log, lines } = capture();
    await request(appWith(log))
      .post(`/fhir/Patient/${PATIENT_ID}`)
      .set("traceparent", `00-${TRACE_ID}-00f067aa0ba902b7-01`)
      .send({});

    const entries = lines.map((line) => JSON.parse(line));
    const access = entries.find((e) => e.msg === "request failed");
    expect(access).toMatchObject({
      service: "neo4j-proxy",
      level: "error",
      trace_id: TRACE_ID,
      method: "POST",
      route: "/fhir/Patient/:id",
      status: 500,
    });
    // Lines written inside the handler share the request's trace id.
    expect(entries.find((e) => e.msg === "lookup")?.trace_id).toBe(TRACE_ID);
  });

  // #519: a load test run's id on the access line, so Loki can filter one run.
  it("carry the load test id when the header is well formed, and nothing otherwise", async () => {
    const { log, lines } = capture();
    const app = appWith(log);
    await request(app)
      .post(`/fhir/Patient/${PATIENT_ID}`)
      .set("x-load-test", "20261006-0900-load-azure")
      .send({});
    await request(app)
      .post(`/fhir/Patient/${PATIENT_ID}`)
      .set("x-load-test", "not a run id; drop table")
      .send({});
    await request(app).post(`/fhir/Patient/${PATIENT_ID}`).send({});

    const access = lines
      .map((line) => JSON.parse(line))
      .filter((e) => e.msg === "request failed");
    expect(access).toHaveLength(3);
    expect(access[0].load_test).toBe("20261006-0900-load-azure");
    expect(access[1]).not.toHaveProperty("load_test");
    expect(access[2]).not.toHaveProperty("load_test");
  });

  // The OTLP copy (Azure, where nothing reads stdout) is the redacted line.
  it("send the same redacted lines over OTLP, with their severity", async () => {
    const records: {
      body: string;
      severityText: string;
      severityNumber: number;
    }[] = [];
    const log = createLogger(
      otlpLineStream((record) => records.push(record)),
      "info",
    );
    await request(appWith(log))
      .post(`/fhir/Patient/${PATIENT_ID}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ question: QUESTION });

    const bodies = records.map((r) => r.body).join("\n");
    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(bodies).not.toContain(PATIENT_ID);
    expect(bodies).not.toContain(TOKEN);
    expect(bodies).not.toContain("Erika");
    expect(bodies).not.toContain("MATCH");
    const failed = records.find((r) => r.body.includes('"request failed"'));
    expect(failed).toMatchObject({ severityText: "ERROR", severityNumber: 17 });
    expect(JSON.parse(failed!.body)).toMatchObject({
      route: "/fhir/Patient/:id",
      status: 500,
    });
  });

  it("leave health probes out", async () => {
    const { log, lines } = capture();
    await request(appWith(log)).get("/health");
    expect(lines).toEqual([]);
  });

  it("start a new trace for a missing or malformed traceparent", () => {
    expect(traceIdFrom(undefined)).toMatch(/^[\da-f]{32}$/);
    expect(traceIdFrom("garbage")).toMatch(/^[\da-f]{32}$/);
    expect(traceIdFrom(`00-${"0".repeat(32)}-00f067aa0ba902b7-01`)).not.toBe(
      "0".repeat(32),
    );
    expect(traceIdFrom(`00-${TRACE_ID}-00f067aa0ba902b7-01`)).toBe(TRACE_ID);
  });
});
