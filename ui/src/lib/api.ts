/** Static-export mock path mapping — keyed by exact endpoint or prefix */
const STATIC_MOCK_MAP: Record<string, string> = {
  "/api/catalog": "/mock/catalog.json",
  "/api/catalog/jsonld": "/mock/catalog_jsonld.json",
  "/api/graph": "/mock/graph.json",
  "/api/compliance": "/mock/compliance.json",
  "/api/compliance/tck": "/mock/compliance_tck.json",
  "/api/permits": "/mock/permits.json",
  "/api/activity-report": "/mock/activity_report.json",
  "/api/compliance/requests": "/mock/requests.json",
  "/api/compliance/applications": "/mock/applications.json",
  "/api/compliance/findings": "/mock/findings.json",
  "/api/compliance/results": "/mock/results.json",
  "/api/information": "/mock/information.json",
  "/api/jurisdictions": "/mock/jurisdictions.json",
  "/api/compliance/information-requests": "/mock/information_requests.json",
  "/api/patient": "/mock/patient.json",
  "/api/patient/profile": "/mock/patient_profile_list.json",
  "/api/patient/insights": "/mock/patient_insights.json",
  "/api/patient/research": "/mock/patient_research.json",
  "/api/patient/opt-out": "/mock/patient_opt_out.json",
  "/api/patient/observations": "/mock/patient_observations.json",
  "/api/patient/app-devices": "/mock/patient_app_devices.json",
  "/api/patient/wallet-link": "/mock/patient_wallet_link.json",
  "/api/analytics": "/mock/analytics.json",
  "/api/eehrxf": "/mock/eehrxf.json",
  "/api/nlq": "/mock/nlq_templates.json",
  "/api/federated": "/mock/federated_stats.json",
  "/api/credentials": "/mock/credentials.json",
  "/api/credentials/definitions": "/mock/credential_definitions.json",
  "/api/trust-center": "/mock/trust_center.json",
  "/api/participants": "/mock/participants.json",
  "/api/participants/me": "/mock/participants_me.json",
  "/api/assets": "/mock/assets.json",
  "/api/admin/tenants": "/mock/admin_tenants.json",
  "/api/admin/participants": "/mock/admin_participants.json",
  "/api/admin/policies": "/mock/admin_policies.json",
  "/api/admin/components": "/mock/admin_components.json",
  "/api/admin/components/topology": "/mock/admin_components_topology.json",
  "/api/admin/spe": "/mock/admin_spe.json",
  "/api/odrl/scope": "/mock/odrl_scope.json",
};

/** Prefix-based mock paths — matched via startsWith (checked after exact, first match wins) */
const STATIC_MOCK_PREFIX: [string, string][] = [
  // HealthDCAT-AP Release 8 JSON-LD of one dataset (#700)
  ["/api/catalog/jsonld?", "/mock/catalog_jsonld.json"],
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
  // Patient sub-routes with query params. The pages ask for the persona's
  // own record (useOwnRecord), so patient2 gets P2's file; any other id, P1
  // included, gets the P1 file.
  [
    "/api/patient/insights?patientId=P2",
    "/mock/patient_insights_patient2.json",
  ],
  [
    "/api/patient/research?patientId=P2",
    "/mock/patient_research_patient2.json",
  ],
  ["/api/patient/insights?", "/mock/patient_insights.json"],
  ["/api/patient/research?", "/mock/patient_research.json"],
  ["/api/patient/opt-out?", "/mock/patient_opt_out.json"],
  ["/api/patient/observations?", "/mock/patient_observations.json"],
  // Persona overview (issue #271): the patient view is served, the rest say so
  ["/api/overview?persona=patient", "/mock/overview_patient.json"],
  ["/api/overview?persona=hdab", "/mock/overview_hdab.json"],
  ["/api/overview?persona=hospital", "/mock/overview_hospital.json"],
  ["/api/overview?persona=researcher", "/mock/overview_researcher.json"],
  ["/api/overview?persona=", "/mock/overview_not_implemented.json"],
  ["/api/overview", "/mock/overview_patient.json"],
  // One patient's clinical timeline, the same synthetic events for any id
  // (a PATIENT persona reads its own timeline from /api/patient instead)
  ["/api/patient?patientId=", "/mock/patient_timeline.json"],
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

/** The demo patient persona in use, if any (static mode only). */
function patientPersona(): "patient1" | "patient2" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("demo-persona");
    return raw === "patient1" || raw === "patient2" ? raw : null;
  } catch {
    return null;
  }
}

function resolveMockPath(endpoint: string): string {
  // PATIENT role restriction: return restricted patient data (own record only)
  const persona = endpoint === "/api/patient" ? patientPersona() : null;
  if (persona === "patient2") return "/mock/patient_restricted_patient2.json";
  if (persona === "patient1") return "/mock/patient_restricted.json";

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
