/**
 * The "Broken" badge on /admin/components follows the live status (#774):
 * an app on the list of apps known to be broken on Azure shows it only while
 * its status is not healthy. Since #927 the list holds the control plane,
 * IdentityHub and IssuerService; siglet, the data plane, is not on it.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopoComponentCard } from "@/app/admin/components/_components/TopoComponentCard";
import { KNOWN_BROKEN_ACA_APPS } from "@/app/admin/components/_components/constants";
import type { Severity } from "@/app/admin/components/_components/types";

const listed = (severity: Severity) => ({
  name: "Identity Hub",
  container: "mvhd-identityhub",
  status: severity === "healthy" ? "Healthy" : "Unknown",
  severity,
  cpu: 0.2,
  memMB: 7,
  uptime: "",
});

describe("TopoComponentCard", () => {
  it("does not call a healthy app broken, even one on the known-broken list", () => {
    render(<TopoComponentCard comp={listed("healthy")} />);
    expect(screen.queryByText("Broken")).not.toBeInTheDocument();
  });

  it("calls a listed app broken while its status is not healthy", () => {
    render(<TopoComponentCard comp={listed("unknown")} />);
    expect(screen.getByText("Broken")).toBeInTheDocument();
  });

  it("calls any app broken whose status is critical", () => {
    render(
      <TopoComponentCard
        comp={{ ...listed("critical"), container: "mvhd-ui" }}
      />,
    );
    expect(screen.getByText("Broken")).toBeInTheDocument();
  });

  it("does not call siglet broken while its status is unknown: it is not listed", () => {
    render(
      <TopoComponentCard
        comp={{
          ...listed("unknown"),
          name: "Data Plane (siglet)",
          container: "mvhd-siglet",
        }}
      />,
    );
    expect(screen.queryByText("Broken")).not.toBeInTheDocument();
  });

  it("does not list a retired EDC 0.18 app as known broken", () => {
    for (const retired of [
      "mvhd-dp-fhir",
      "mvhd-dp-omop",
      "mvhd-tenant-mgr",
      "mvhd-provision-mgr",
      "mvhd-cfm-kcagent",
      "mvhd-cfm-edcvagent",
      "mvhd-cfm-regagent",
      "mvhd-cfm-obagent",
      "mvhd-cfm-cp-shim",
    ]) {
      expect(KNOWN_BROKEN_ACA_APPS.has(retired)).toBe(false);
    }
  });
});
