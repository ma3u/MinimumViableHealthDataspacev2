/**
 * The "Broken" badge on /admin/components follows the live status (#774):
 * a CFM manager on the list of apps known to be broken on Azure shows it
 * only while its status is not healthy.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopoComponentCard } from "@/app/admin/components/_components/TopoComponentCard";
import type { Severity } from "@/app/admin/components/_components/types";

const manager = (severity: Severity) => ({
  name: "Tenant Manager",
  container: "mvhd-tenant-mgr",
  status: severity === "healthy" ? "Healthy" : "Unknown",
  severity,
  cpu: 0.2,
  memMB: 7,
  uptime: "",
});

describe("TopoComponentCard", () => {
  it("does not call a healthy app broken, even one on the known-broken list", () => {
    render(<TopoComponentCard comp={manager("healthy")} />);
    expect(screen.queryByText("Broken")).not.toBeInTheDocument();
  });

  it("calls a listed app broken while its status is not healthy", () => {
    render(<TopoComponentCard comp={manager("unknown")} />);
    expect(screen.getByText("Broken")).toBeInTheDocument();
  });

  it("calls any app broken whose status is critical", () => {
    render(
      <TopoComponentCard
        comp={{ ...manager("critical"), container: "mvhd-ui" }}
      />,
    );
    expect(screen.getByText("Broken")).toBeInTheDocument();
  });
});
