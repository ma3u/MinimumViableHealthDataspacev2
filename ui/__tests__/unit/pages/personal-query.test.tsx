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
  it("keeps exactly 3 questions", () => {
    expect(personalResearchQA.map((q) => q.id)).toEqual([
      "sport",
      "nutrition",
      "breathing",
    ]);
  });

  it("answers a typed question after Send with a trend AND a related ePA event", () => {
    render(<PersonalQueryPage />);
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
    // ePA event folded into the answer
    expect(screen.getByText(/Related ePA events/)).toBeInTheDocument();
    expect(screen.getByText(/meniscus repair/i)).toBeInTheDocument();
    expect(screen.getByText("Surgery")).toBeInTheDocument();
  });

  it("a suggestion fills the box and submits, showing the answer below", () => {
    render(<PersonalQueryPage />);
    fireEvent.click(screen.getByText(/breathing exercises/i));
    const input = screen.getByLabelText(
      /Ask a question about your own health data/i,
    ) as HTMLInputElement;
    // the question was copied into the box
    expect(input.value).toMatch(/breathing exercises/i);
    // breathing answer folds in respiratory ePA events
    expect(screen.getByText(/CRP fell/i)).toBeInTheDocument();
    expect(screen.getAllByText("Infection").length).toBeGreaterThan(0);
    expect(screen.getByText("Vaccination")).toBeInTheDocument();
  });

  it("out-of-scope questions get a graceful own-data fallback", () => {
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

  it("matchPersonalResearch maps keywords to one of the 3 answers (or null)", () => {
    expect(matchPersonalResearch("my running and VO2")?.id).toBe("sport");
    expect(matchPersonalResearch("nutrition and cholesterol")?.id).toBe(
      "nutrition",
    );
    expect(matchPersonalResearch("breathing, asthma and covid")?.id).toBe(
      "breathing",
    );
    expect(matchPersonalResearch("hello world")).toBeNull();
  });

  it("every Q&A draws on own data — trends + ePA events", () => {
    for (const qa of personalResearchQA) {
      expect(qa.source).toMatch(/own data only/i);
      expect(qa.trends.length).toBeGreaterThan(0);
      expect(qa.events.length).toBeGreaterThan(0);
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
