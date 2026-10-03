import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AzureCostEstimatorPanel } from "@/app/admin/components/_components/AzureCostEstimatorPanel";
import { CostEstimatorPanel } from "@/app/admin/components/_components/CostEstimatorPanel";

describe("AzureCostEstimatorPanel", () => {
  it("shows the Flexible Server, the schedule and the bill", () => {
    render(
      <AzureCostEstimatorPanel liveComponents={[]} participantCount={5} />,
    );
    expect(screen.getByText("PostgreSQL Flexible Server")).toBeInTheDocument();
    expect(screen.getByText(/Standard_B1ms/)).toBeInTheDocument();
    expect(screen.getByText("282 h/mo")).toBeInTheDocument();
    expect(
      screen.getByText(/billed 2026-09-03 to 2026-10-02/),
    ).toBeInTheDocument();
    // always-on apps show what the night costs
    expect(screen.getAllByText(/^idle €/).length).toBe(4);
  });

  it("takes the live memory reservation over the fallback", () => {
    render(
      <AzureCostEstimatorPanel
        liveComponents={[
          {
            container: "mvhd-neo4j",
            mem: { limitMB: 4096 },
          } as never,
        ]}
        participantCount={5}
      />,
    );
    expect(screen.getByText(/1 vCPU · 4 GiB RAM/)).toBeInTheDocument();
  });
});

describe("CostEstimatorPanel (STACKIT)", () => {
  it("prices PostgreSQL Flex and the servers, and moves with the slider", () => {
    render(<CostEstimatorPanel participantCount={5} />);
    expect(screen.getByText(/2.4 Single · 32 GB/)).toBeInTheDocument();
    expect(screen.getAllByText(/g2i\.\d · \d vCPU/)).toHaveLength(3);
    expect(screen.getByText("5 participants")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "50" } });
    expect(screen.getByText("50 participants")).toBeInTheDocument();
  });
});
