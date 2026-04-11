import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/compliance/tck
 *
 * Returns a combined compliance scorecard by:
 *  1. Fetching DSP + DCP results from neo4j-proxy /tck endpoint
 *     (runs inside Docker network with correct auth context)
 *  2. Running Neo4j graph-integrity queries directly (EHDS layer)
 */

interface TestResult {
  id: string;
  category: string;
  suite: "DSP" | "DCP" | "EHDS";
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

const NEO4J_PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const results: TestResult[] = [];
  const timestamp = new Date().toISOString();

  // ── DSP + DCP Suites (via neo4j-proxy running inside Docker) ─────
  try {
    const proxyRes = await fetch(`${NEO4J_PROXY_URL}/tck`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (proxyRes.ok) {
      const proxyData = (await proxyRes.json()) as {
        results: TestResult[];
      };
      results.push(...proxyData.results);
    } else {
      // Proxy returned an error — add error entries for DSP + DCP
      results.push({
        id: "DSP-ERR",
        category: "Schema Compliance",
        suite: "DSP",
        name: "DSP proxy check",
        status: "fail",
        detail: `neo4j-proxy /tck returned ${proxyRes.status}`,
      });
      results.push({
        id: "DCP-ERR",
        category: "DID Resolution",
        suite: "DCP",
        name: "DCP proxy check",
        status: "fail",
        detail: `neo4j-proxy /tck returned ${proxyRes.status}`,
      });
    }
  } catch (err) {
    results.push({
      id: "DSP-ERR",
      category: "Schema Compliance",
      suite: "DSP",
      name: "DSP proxy connectivity",
      status: "fail",
      detail: `neo4j-proxy unreachable: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    results.push({
      id: "DCP-ERR",
      category: "DID Resolution",
      suite: "DCP",
      name: "DCP proxy connectivity",
      status: "fail",
      detail: `neo4j-proxy unreachable: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

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
