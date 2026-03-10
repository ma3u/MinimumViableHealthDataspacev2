import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

/**
 * GET /api/compliance/tck
 *
 * Returns a combined compliance scorecard by:
 *  1. Probing EDC Management API health endpoints (DSP layer)
 *  2. Probing IdentityHub / IssuerService (DCP layer)
 *  3. Running Neo4j graph-integrity queries (EHDS layer)
 */

interface TestResult {
  id: string;
  category: string;
  suite: "DSP" | "DCP" | "EHDS";
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

const EDC_MGMT =
  process.env.EDC_MANAGEMENT_URL ??
  "http://health-dataspace-controlplane:8081/api/mgmt";
const IDENTITY_URL =
  process.env.EDC_IDENTITY_URL ??
  "http://health-dataspace-identityhub:7081/api/identity";
const ISSUER_URL =
  process.env.EDC_ISSUER_URL ??
  "http://health-dataspace-issuerservice:10013/api/admin";

const PARTICIPANTS = [
  "test-clinic",
  "clinic-charite",
  "cro-bayer",
  "hdab-bfarm",
];

async function probe(url: string, init?: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const results: TestResult[] = [];
  const timestamp = new Date().toISOString();

  // ── DSP Suite ────────────────────────────────────────────────────
  // DSP-1: Readiness
  const readiness = await probe(
    `${EDC_MGMT.replace("/api/mgmt", "")}/api/check/readiness`,
  );
  results.push({
    id: "DSP-1.1",
    category: "Schema Compliance",
    suite: "DSP",
    name: "Control Plane Readiness",
    status: readiness ? "pass" : "fail",
    detail: readiness
      ? "GET /api/check/readiness → 200"
      : "Control plane not reachable",
  });

  // DSP-2: Liveness
  const liveness = await probe(
    `${EDC_MGMT.replace("/api/mgmt", "")}/api/check/liveness`,
  );
  results.push({
    id: "DSP-1.2",
    category: "Schema Compliance",
    suite: "DSP",
    name: "Control Plane Liveness",
    status: liveness ? "pass" : "fail",
    detail: liveness
      ? "GET /api/check/liveness → 200"
      : "Liveness probe failed",
  });

  // DSP-3: Catalog per participant
  for (const ctx of PARTICIPANTS) {
    const body = JSON.stringify({
      "@context": ["https://w3id.org/edc/connector/management/v2"],
      "@type": "QuerySpec",
    });
    const data = await probeJson<{ "@type"?: string }>(
      `${EDC_MGMT}/v5alpha/participants/${ctx}/catalog/request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      },
    );
    results.push({
      id: `DSP-2.${PARTICIPANTS.indexOf(ctx) + 1}`,
      category: "Catalog Protocol",
      suite: "DSP",
      name: `Catalog query — ${ctx}`,
      status: data ? "pass" : "fail",
      detail: data
        ? `Catalog response type: ${data["@type"] ?? "ok"}`
        : "Catalog request failed",
    });
  }

  // ── DCP Suite ────────────────────────────────────────────────────
  // DCP-1: IdentityHub health
  const ihHealth = await probe(IDENTITY_URL);
  results.push({
    id: "DCP-1.1",
    category: "DID Resolution",
    suite: "DCP",
    name: "IdentityHub reachable",
    status: ihHealth ? "pass" : "fail",
    detail: ihHealth ? "IdentityHub responded" : "IdentityHub unreachable",
  });

  // DCP-2: Key pairs per participant
  for (const ctx of PARTICIPANTS) {
    const data = await probeJson<unknown[]>(
      `${IDENTITY_URL}/v1alpha/participants/${ctx}/keypairs`,
    );
    const hasPairs = Array.isArray(data) && data.length > 0;
    results.push({
      id: `DCP-2.${PARTICIPANTS.indexOf(ctx) + 1}`,
      category: "Key Pair Management",
      suite: "DCP",
      name: `Key pairs — ${ctx}`,
      status: hasPairs ? "pass" : "fail",
      detail: hasPairs ? `${data!.length} key pair(s) found` : "No key pairs",
    });
  }

  // DCP-3: IssuerService health
  const issuerHealth = await probe(
    `${ISSUER_URL}/v1alpha/credentialdefinitions`,
  );
  results.push({
    id: "DCP-3.1",
    category: "Issuer Service",
    suite: "DCP",
    name: "IssuerService reachable",
    status: issuerHealth ? "pass" : "fail",
    detail: issuerHealth
      ? "IssuerService responded"
      : "IssuerService unreachable",
  });

  // ── EHDS Suite ───────────────────────────────────────────────────
  try {
    // EHDS-1: HealthDataset nodes exist
    const datasets = await runQuery<{ count: number }>(
      "MATCH (d:HealthDataset) RETURN count(d) AS count",
    );
    const dsCount = datasets[0]?.count ?? 0;
    results.push({
      id: "EHDS-1.1",
      category: "HealthDCAT-AP",
      suite: "EHDS",
      name: "HealthDataset nodes present",
      status: dsCount > 0 ? "pass" : "fail",
      detail: `${dsCount} HealthDataset node(s)`,
    });

    // EHDS-2: EEHRxF profiles
    const profiles = await runQuery<{ count: number }>(
      "MATCH (p:EEHRxFProfile) RETURN count(p) AS count",
    );
    const profCount = profiles[0]?.count ?? 0;
    results.push({
      id: "EHDS-2.1",
      category: "EEHRxF Profiles",
      suite: "EHDS",
      name: "EEHRxF profiles present",
      status: profCount > 0 ? "pass" : "fail",
      detail: `${profCount} EEHRxF profile(s)`,
    });

    // EHDS-3: OMOP Person nodes
    const persons = await runQuery<{ count: number }>(
      "MATCH (p:OMOPPerson) RETURN count(p) AS count",
    );
    const personCount = persons[0]?.count ?? 0;
    results.push({
      id: "EHDS-3.1",
      category: "OMOP CDM",
      suite: "EHDS",
      name: "OMOP Person nodes present",
      status: personCount > 0 ? "pass" : "fail",
      detail: `${personCount} OMOPPerson node(s)`,
    });

    // EHDS-4: Article 53 approval chain
    const approvals = await runQuery<{ count: number }>(
      `MATCH (a:HDABApproval)-[:APPROVES]->(app:AccessApplication)
       RETURN count(a) AS count`,
    );
    const approvalCount = approvals[0]?.count ?? 0;
    results.push({
      id: "EHDS-4.1",
      category: "Article 53 Enforcement",
      suite: "EHDS",
      name: "HDAB approval chains",
      status: approvalCount > 0 ? "pass" : "fail",
      detail: `${approvalCount} approval chain(s)`,
    });

    // EHDS-5: Verifiable Credential nodes
    const vcs = await runQuery<{ count: number }>(
      "MATCH (vc:VerifiableCredential) RETURN count(vc) AS count",
    );
    const vcCount = vcs[0]?.count ?? 0;
    results.push({
      id: "EHDS-5.1",
      category: "Verifiable Credentials",
      suite: "EHDS",
      name: "VC nodes in graph",
      status: vcCount > 0 ? "pass" : "fail",
      detail: `${vcCount} VerifiableCredential node(s)`,
    });

    // EHDS-6: Graph node count (5-layer population)
    const nodeCount = await runQuery<{ count: number }>(
      "MATCH (n) RETURN count(n) AS count",
    );
    const totalNodes = nodeCount[0]?.count ?? 0;
    results.push({
      id: "EHDS-6.1",
      category: "Knowledge Graph",
      suite: "EHDS",
      name: "Total graph nodes",
      status: totalNodes > 100 ? "pass" : "fail",
      detail: `${totalNodes} total nodes`,
    });
  } catch (err) {
    results.push({
      id: "EHDS-ERR",
      category: "Knowledge Graph",
      suite: "EHDS",
      name: "Neo4j connectivity",
      status: "fail",
      detail: `Neo4j error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  // ── Summary ──────────────────────────────────────────────────────
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  return NextResponse.json({
    timestamp,
    summary: { total: results.length, passed, failed, skipped },
    suites: {
      DSP: {
        results: results.filter((r) => r.suite === "DSP"),
        passed: results.filter((r) => r.suite === "DSP" && r.status === "pass")
          .length,
        total: results.filter((r) => r.suite === "DSP").length,
      },
      DCP: {
        results: results.filter((r) => r.suite === "DCP"),
        passed: results.filter((r) => r.suite === "DCP" && r.status === "pass")
          .length,
        total: results.filter((r) => r.suite === "DCP").length,
      },
      EHDS: {
        results: results.filter((r) => r.suite === "EHDS"),
        passed: results.filter((r) => r.suite === "EHDS" && r.status === "pass")
          .length,
        total: results.filter((r) => r.suite === "EHDS").length,
      },
    },
  });
}
