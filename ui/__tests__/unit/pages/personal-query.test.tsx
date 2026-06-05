import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PersonalQueryPage from "@/app/patient/query/page";
import {
  personalResearchQA,
  matchPersonalResearch,
} from "@/lib/personal-research";
import { setDemoPersona, clearDemoPersona } from "@/lib/use-demo-persona";

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("Personal Research (NLQ) page", () => {
  it("answers a typed free-text question only after Send, with a trend from own data", () => {
    render(<PersonalQueryPage />);
    // nothing shown before sending
    expect(screen.queryByText(/cardio-fitness improved/i)).toBeNull();
    const input = screen.getByLabelText(
      /Ask a question about your own health data/i,
    );
    fireEvent.change(input, {
      target: { value: "did my running and sport routine help my fitness?" },
    });
    fireEvent.click(screen.getByLabelText(/Send question/i));
    expect(screen.getByText(/cardio-fitness improved/i)).toBeInTheDocument();
    expect(screen.getByText("VO₂max")).toBeInTheDocument();
    expect(screen.getByText(/your own data only/i)).toBeInTheDocument();
  });

  it("a suggestion chip sends the question and reveals the answer", () => {
    render(<PersonalQueryPage />);
    fireEvent.click(screen.getByText(/increased my daily sport routine/i));
    expect(screen.getByText(/cardio-fitness improved/i)).toBeInTheDocument();
  });

  it("out-of-scope questions get a graceful own-data-only fallback", () => {
    render(<PersonalQueryPage />);
    const input = screen.getByLabelText(
      /Ask a question about your own health data/i,
    );
    fireEvent.change(input, { target: { value: "what is the weather today" } });
    fireEvent.click(screen.getByLabelText(/Send question/i));
    expect(
      screen.getByText(/I can only answer from your own/i),
    ).toBeInTheDocument();
  });

  it("matchPersonalResearch maps keywords to the right answer (or null)", () => {
    expect(matchPersonalResearch("my running and VO2")?.id).toBe("sport");
    expect(matchPersonalResearch("breathing and stress")?.id).toBe("breathing");
    expect(matchPersonalResearch("nutrition and cholesterol")?.id).toBe(
      "nutrition",
    );
    expect(matchPersonalResearch("hello world")).toBeNull();
  });

  it("every Q&A is computed from the patient's own data only", () => {
    for (const qa of personalResearchQA) {
      expect(qa.source).toMatch(/own data only/i);
      expect(qa.trends.length).toBeGreaterThan(0);
      expect(qa.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe("demo persona sign-out", () => {
  it("setDemoPersona mirrors to localStorage; clearDemoPersona clears it", () => {
    setDemoPersona("patient1");
    expect(localStorage.getItem("demo-persona")).toBe("patient1");
    clearDemoPersona();
    expect(localStorage.getItem("demo-persona")).toBeNull();
  });
});
