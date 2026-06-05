import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrendChart } from "@/components/charts/TrendChart";
import { HealthDetailModal } from "@/components/HealthDetailModal";
import { personalHealth } from "@/lib/journey-config";

describe("TrendChart", () => {
  it("renders an SVG line + area for >= 2 points", () => {
    const { container } = render(
      <TrendChart points={[1, 2, 3, 4]} color="#CA6F1E" />,
    );
    expect(container.querySelector("polyline")).toBeInTheDocument();
    expect(container.querySelector("polygon")).toBeInTheDocument();
  });

  it("renders nothing for < 2 points", () => {
    const { container } = render(<TrendChart points={[1]} color="#000" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("HealthDetailModal", () => {
  const fitness = personalHealth.find((s) => s.id === "fitness")!;
  const nutrition = personalHealth.find((s) => s.id === "nutrition")!;

  it("shows the fitness trends (VO₂max / HRV / Sleep) and closes on Escape", () => {
    const onClose = vi.fn();
    render(<HealthDetailModal source={fitness} onClose={onClose} />);
    expect(screen.getByText(/VO.max/)).toBeInTheDocument();
    expect(screen.getByText("HRV")).toBeInTheDocument();
    expect(screen.getByText("Sleep")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the nutrition weekly plan + adherence trend", () => {
    render(<HealthDetailModal source={nutrition} onClose={() => {}} />);
    expect(screen.getByText("Adherence")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getAllByText(/kcal/i).length).toBeGreaterThanOrEqual(7);
  });

  it("uses no Whoop trademark in any personal-health source", () => {
    for (const s of personalHealth) {
      expect(s.source).not.toContain("Whoop");
      for (const t of s.trends) expect(t.label).not.toContain("Whoop");
    }
  });
});
