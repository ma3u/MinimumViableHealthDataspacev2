/** Static-export mock path mapping — keyed by exact endpoint or prefix */
const STATIC_MOCK_MAP: Record<string, string> = {
  "/api/catalog": "/mock/catalog.json",
  "/api/graph": "/mock/graph.json",
  "/api/compliance": "/mock/compliance.json",
  "/api/compliance/tck": "/mock/compliance_tck.json",
  "/api/patient": "/mock/patient.json",
  "/api/patient/profile": "/mock/patient_profile_list.json",
  "/api/patient/insights": "/mock/patient_insights.json",
  "/api/patient/research": "/mock/patient_research.json",
  "/api/analytics": "/mock/analytics.json",
  "/api/eehrxf": "/mock/eehrxf.json",
  "/api/nlq": "/mock/nlq_templates.json",
  "/api/federated": "/mock/federated_stats.json",
  "/api/credentials": "/mock/credentials.json",
  "/api/participants": "/mock/participants.json",
  "/api/participants/me": "/mock/participants_me.json",
  "/api/assets": "/mock/assets.json",
  "/api/admin/tenants": "/mock/admin_tenants.json",
  "/api/admin/policies": "/mock/admin_policies.json",
  "/api/admin/components": "/mock/admin_components.json",
  "/api/admin/components/topology": "/mock/admin_components_topology.json",
  "/api/odrl/scope": "/mock/odrl_scope.json",
};

/** Prefix-based mock paths — matched via startsWith (checked after exact, first match wins) */
const STATIC_MOCK_PREFIX: [string, string][] = [
  // Persona-specific graph views (checked before default /api/graph)
  ["/api/graph?persona=patient", "/mock/graph_patient.json"],
  ["/api/graph?persona=hospital", "/mock/graph_hospital.json"],
  ["/api/graph?persona=researcher", "/mock/graph_researcher.json"],
  ["/api/graph?persona=edc-admin", "/mock/graph_edc_admin.json"],
  ["/api/graph?persona=hdab", "/mock/graph_hdab.json"],
  ["/api/graph?persona=trust-center", "/mock/graph_trust_center.json"],
  ["/api/graph?", "/mock/graph.json"],
  // Graph node properties (return empty in static mode)
  ["/api/graph/node?", "/mock/graph.json"],
  ["/api/graph/expand?", "/mock/graph.json"],
  // Patient profile — specific patient IDs first
  ["/api/patient/profile?patientId=P1", "/mock/patient_profile_patient1.json"],
  ["/api/patient/profile?patientId=P2", "/mock/patient_profile_patient2.json"],
  ["/api/patient/profile?", "/mock/patient_profile_patient1.json"],
  // Patient sub-routes with query params
  ["/api/patient/insights?", "/mock/patient_insights.json"],
  ["/api/patient/research?", "/mock/patient_research.json"],
  // Legacy patient endpoint
  ["/api/patient?", "/mock/patient_default.json"],
  // Other prefixes
  ["/api/compliance?", "/mock/compliance_check.json"],
  ["/api/negotiations", "/mock/negotiations.json"],
  ["/api/transfers", "/mock/transfers.json"],
  ["/api/tasks", "/mock/tasks.json"],
  ["/api/admin/audit", "/mock/admin_audit.json"],
  ["/api/participants/", "/mock/credentials.json"],
];

/** Check if the current demo persona is a PATIENT role (static mode only). */
function isPatientPersona(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("demo-persona");
    return raw === "patient1" || raw === "patient2";
  } catch {
    return false;
  }
}

function resolveMockPath(endpoint: string): string {
  // PATIENT role restriction: return restricted patient data (own record only)
  if (endpoint === "/api/patient" && isPatientPersona()) {
    return "/mock/patient_restricted.json";
  }

  const exact = STATIC_MOCK_MAP[endpoint];
  if (exact) return exact;

  for (const [prefix, path] of STATIC_MOCK_PREFIX) {
    if (endpoint.startsWith(prefix)) return path;
  }
  return endpoint; // fallback: pass through unchanged
}

export async function fetchApi(
  endpoint: string,
  init?: RequestInit,
): Promise<Response> {
  const isStatic = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
  const basePath = isStatic ? "/MinimumViableHealthDataspacev2" : "";

  if (isStatic) {
    // Return synthetic success for non-GET mutations (POST/PUT/DELETE/PATCH)
    // so donate/revoke/create buttons work visually in the static demo.
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return new Response(
        JSON.stringify({ ok: true, message: "Registered in demo mode." }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const mockPath = resolveMockPath(endpoint);
    // Simulate small latency to make it feel natural
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fetch(basePath + mockPath, init);
  }

  return fetch(endpoint, init);
}
