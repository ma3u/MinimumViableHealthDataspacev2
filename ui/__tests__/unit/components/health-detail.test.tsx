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

  it("shows weekly goals (30 plants/week, fibre, protein) with progress bars", () => {
    render(<HealthDetailModal source={nutrition} onClose={() => {}} />);
    expect(screen.getByText("Weekly goals")).toBeInTheDocument();
    // 30-plants-per-week goal
    expect(screen.getByText("/ 30 plants/wk")).toBeInTheDocument();
    expect(screen.getByText("30 different fruit & veg")).toBeInTheDocument();
    // fibre + protein appear both as a goal and as an intake trend
    expect(screen.getAllByText("Fibre").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Protein").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("WHO ≥ 25–30 g/day")).toBeInTheDocument();
    expect(screen.getByText("≈ 1.2 g/kg body weight")).toBeInTheDocument();
    // three progress bars, two of which are met (fibre 34≥30, protein 95≥75)
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    expect(screen.getAllByText("met")).toHaveLength(2);
    // plants (27/30) shows a text "to go" cue — not colour alone (WCAG 1.4.1)
    expect(screen.getByText("3 to go")).toBeInTheDocument();
  });

  it("shows fibre and protein intake as 12-week trends", () => {
    render(<HealthDetailModal source={nutrition} onClose={() => {}} />);
    // Plants/Fibre/Protein each render once as a trend label (and once as a goal)
    expect(screen.getAllByText("Plants").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/g\/day/).length).toBeGreaterThanOrEqual(2);
  });

  it("uses no Whoop trademark in any personal-health source", () => {
    for (const s of personalHealth) {
      expect(s.source).not.toContain("Whoop");
      for (const t of s.trends) expect(t.label).not.toContain("Whoop");
    }
  });
});
