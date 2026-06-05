import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PersonalQueryPage from "@/app/patient/query/page";
import { personalResearchQA } from "@/lib/personal-research";
import { setDemoPersona, clearDemoPersona } from "@/lib/use-demo-persona";

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("Personal Research (NLQ) page", () => {
  it("offers 3 questions and reveals an answer + trend chart from own data on click", () => {
    render(<PersonalQueryPage />);
    expect(personalResearchQA).toHaveLength(3);
    const chip = screen.getByText(/increased my daily sport routine/i);
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);
    expect(screen.getByText(/cardio-fitness improved/i)).toBeInTheDocument();
    expect(screen.getByText("VO₂max")).toBeInTheDocument();
    expect(screen.getByText("HRV")).toBeInTheDocument();
    expect(screen.getByText(/your own data only/i)).toBeInTheDocument();
  });

  it("every Q&A is computed from the patient's own data only", () => {
    for (const qa of personalResearchQA) {
      expect(qa.source).toMatch(/own data only/i);
      expect(qa.trends.length).toBeGreaterThan(0);
    }
  });
});

describe("demo persona sign-out", () => {
  it("setDemoPersona mirrors to localStorage; clearDemoPersona clears it", () => {
    setDemoPersona("patient1");
    expect(localStorage.getItem("demo-persona")).toBe("patient1");
    clearDemoPersona();
    // localStorage cleared so lib/api.ts isPatientPersona() no longer resolves
    // the signed-out patient's restricted record.
    expect(localStorage.getItem("demo-persona")).toBeNull();
  });
});
