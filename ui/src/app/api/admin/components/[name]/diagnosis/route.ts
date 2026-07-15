import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Diagnosis {
  name: string;
  severity: "critical" | "warning" | "healthy" | "unknown";
  summary: string;
  cause: string;
  bootError?: string;
  remediation?: string;
  trackingIssue?: string;
}

// Static diagnosis map. These boot errors are deterministic (config-driven, not
// transient), so a static catalogue is more useful than tailing logs — which
// is also unavailable on this deployment because Log Analytics is disabled
// (ADR-018, Workaround B).
const KNOWN_DIAGNOSES: Record<string, Diagnosis> = {
  "mvhd-controlplane": {
    name: "mvhd-controlplane",
    severity: "critical",
    summary: "JVM crashes at boot — Jetty port collision.",
    cause:
      "EDC's controlplane needs four distinct Jetty ports (web 8080 / management 8081 / protocol 8082 / control 8083). " +
      "ACA Container Apps' default ingress exposes a single target port, so scripts/azure/04-edc-services.sh forces all four onto 8081. " +
      "Jetty's PortMappingRegistryImpl rejects the duplicate binding and the JVM exits before any HTTP listener comes up.",
    bootError:
      "java.lang.IllegalArgumentException: A binding for port 8081 already exists\n" +
      "  at org.eclipse.edc.web.jetty.PortMappingRegistryImpl.register(PortMappingRegistryImpl.java:35)\n" +
      "  at org.eclipse.edc.virtual.connector.controlplane.api.management.ManagementApiConfigurationExtension.initialize(...)",
    remediation:
      "Restart will not fix this — the failure is config-driven, not transient. Resolution requires either configuring ACA " +
      "additionalPortMappings (multi-port ingress) or migrating EDC services to AKS. Currently scaled to min-replicas=0 to avoid cost.",
    trackingIssue:
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25",
  },
  "mvhd-identityhub": {
    name: "mvhd-identityhub",
    severity: "critical",
    summary: "JVM boots, but HTTP listener doesn't reach ACA target-port.",
    cause:
      "IdentityHub configures five distinct web ports (7080 default, 7081 identity, 7082 credentials, 7083 did, 7084 sts). " +
      "Same single-port mismatch as controlplane — ACA only exposes target-port 7081, so the IdentityAPI on /api/identity is " +
      "either unreachable or shadowed depending on which port collapses to which path. TCK probes time out.",
    remediation:
      "Same as controlplane — multi-port ACA or AKS. Currently scaled to min-replicas=0.",
    trackingIssue:
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25",
  },
  "mvhd-issuerservice": {
    name: "mvhd-issuerservice",
    severity: "critical",
    summary: "Same multi-port mismatch as identityhub.",
    cause:
      "IssuerService inherits the IdentityHub OAuth extension and the same multi-port web layout. " +
      "Even though the JVM boots past dependency injection, the Admin API is not reachable through ACA's single target-port.",
    remediation:
      "Same as controlplane / identityhub. Currently scaled to min-replicas=0.",
    trackingIssue:
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25",
  },
  "mvhd-dp-fhir": {
    name: "mvhd-dp-fhir",
    severity: "critical",
    summary: "Same multi-port mismatch as the controlplane (likely).",
    cause:
      "EDC dataplane uses public + control + signaling web ports (11002 + 11003 + 11004 in JAD config). " +
      "ACA single target-port collapses all to 11002, almost certainly hitting the same Jetty PortMappingRegistry collision. " +
      "Not individually verified — scaled to min-replicas=0 alongside the controlplane.",
    remediation:
      "Same multi-port resolution path as controlplane. Currently scaled to min-replicas=0.",
    trackingIssue:
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25",
  },
  "mvhd-dp-omop": {
    name: "mvhd-dp-omop",
    severity: "critical",
    summary: "Same multi-port mismatch as dp-fhir.",
    cause:
      "Same JAD source, same multi-port web layout, same single-port ACA mismatch. Not individually verified.",
    remediation:
      "Same multi-port resolution path. Currently scaled to min-replicas=0.",
    trackingIssue:
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25",
  },
  "mvhd-tenant-mgr": {
    name: "mvhd-tenant-mgr",
    severity: "warning",
    summary: "CFM service — likely affected by the same architecture mismatch.",
    cause:
      "CFM Tenant Manager has not been individually verified on Azure. Scaled to min-replicas=0 alongside the other " +
      "broken EDC services to avoid cost burn.",
    remediation:
      "Investigate as part of the ADR-012 follow-up. Currently scaled to min-replicas=0.",
    trackingIssue:
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25",
  },
  "mvhd-provision-mgr": {
    name: "mvhd-provision-mgr",
    severity: "warning",
    summary: "CFM service — likely affected by the same architecture mismatch.",
    cause:
      "CFM Provision Manager has not been individually verified on Azure. Scaled to min-replicas=0 alongside the other " +
      "broken EDC services to avoid cost burn.",
    remediation:
      "Investigate as part of the ADR-012 follow-up. Currently scaled to min-replicas=0.",
    trackingIssue:
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25",
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await params;
  const known = KNOWN_DIAGNOSES[name];
  if (known) return NextResponse.json(known);

  return NextResponse.json({
    name,
    severity: "healthy",
    summary: "No known boot issue for this component.",
    cause:
      "This component is not in the known-issue catalogue. If you observe " +
      "instability, check Azure Portal → Container App → Log stream for live diagnostics.",
  } as Diagnosis);
}
