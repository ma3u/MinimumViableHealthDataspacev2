/** Static-export mock path mapping — keyed by exact endpoint or prefix */
const STATIC_MOCK_MAP: Record<string, string> = {
  "/api/catalog": "/mock/catalog.json",
  "/api/graph": "/mock/graph.json",
  "/api/compliance": "/mock/compliance.json",
  "/api/compliance/tck": "/mock/compliance_tck.json",
  "/api/patient": "/mock/patient.json",
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
  "/api/trust-center": "/mock/trust_center.json",
  "/api/trust-center/spe-sessions": "/mock/trust_center_spe_sessions.json",
};

/** Prefix-based mock paths — matched via startsWith (checked after exact) */
const STATIC_MOCK_PREFIX: [string, string][] = [
  ["/api/compliance?", "/mock/compliance_check.json"],
  ["/api/patient?", "/mock/patient_default.json"],
  ["/api/negotiations", "/mock/negotiations.json"],
  ["/api/transfers", "/mock/transfers.json"],
  ["/api/tasks", "/mock/tasks.json"],
  ["/api/admin/audit", "/mock/admin_audit.json"],
  ["/api/participants/", "/mock/credentials.json"],
  ["/api/trust-center/audit", "/mock/trust_center_audit.json"],
];

function resolveMockPath(endpoint: string): string {
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
    const mockPath = resolveMockPath(endpoint);
    // Simulate small latency to make it feel natural
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fetch(basePath + mockPath, init);
  }

  return fetch(endpoint, init);
}
