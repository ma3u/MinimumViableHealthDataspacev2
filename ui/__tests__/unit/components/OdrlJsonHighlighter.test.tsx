/**
 * Tests for OdrlJsonHighlighter component
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OdrlJsonHighlighter from "@/components/OdrlJsonHighlighter";

describe("OdrlJsonHighlighter", () => {
  it("renders JSON data", () => {
    render(<OdrlJsonHighlighter data={{ key: "value" }} />);
    expect(screen.getByText(/"key"/)).toBeInTheDocument();
    expect(screen.getByText(/"value"/)).toBeInTheDocument();
  });

  it("highlights ODRL keywords with cyan class", () => {
    const policy = {
      "odrl:permission": [
        {
          "odrl:action": "odrl:use",
          "odrl:constraint": {
            "odrl:leftOperand": "purpose",
            "odrl:operator": "odrl:eq",
            "odrl:rightOperand": "research",
          },
        },
      ],
    };
    const { container } = render(<OdrlJsonHighlighter data={policy} />);
    const cyanSpans = container.querySelectorAll(".text-cyan-400");
    expect(cyanSpans.length).toBeGreaterThan(0);
  });

  it("highlights EDC keywords with orange class", () => {
    const policy = {
      "edc:PolicyDefinition": {
        "edc:purpose": "secondary-use",
        "edc:anonymize": true,
      },
    };
    const { container } = render(<OdrlJsonHighlighter data={policy} />);
    const orangeSpans = container.querySelectorAll(".text-orange-400");
    expect(orangeSpans.length).toBeGreaterThan(0);
  });

  it("renders string values in emerald", () => {
    const { container } = render(
      <OdrlJsonHighlighter data={{ name: "test" }} />,
    );
    const emeraldSpans = container.querySelectorAll(".text-emerald-400");
    expect(emeraldSpans.length).toBeGreaterThan(0);
  });

  it("renders number values in amber", () => {
    const { container } = render(<OdrlJsonHighlighter data={{ count: 42 }} />);
    const amberSpans = container.querySelectorAll(".text-amber-400");
    expect(amberSpans.length).toBeGreaterThan(0);
  });

  it("renders boolean values in sky", () => {
    const { container } = render(
      <OdrlJsonHighlighter data={{ active: true }} />,
    );
    const skySpans = container.querySelectorAll(".text-sky-400");
    expect(skySpans.length).toBeGreaterThan(0);
  });

  it("renders null values", () => {
    const { container } = render(
      <OdrlJsonHighlighter data={{ empty: null }} />,
    );
    const nullSpans = container.querySelectorAll(
      ".text-gray-500.italic, .text-\\[var\\(--text-secondary\\)\\].italic",
    );
    expect(nullSpans.length).toBeGreaterThan(0);
  });

  it("renders keys in purple", () => {
    const { container } = render(
      <OdrlJsonHighlighter data={{ regularKey: "value" }} />,
    );
    const purpleSpans = container.querySelectorAll(".text-purple-400");
    expect(purpleSpans.length).toBeGreaterThan(0);
  });

  it("applies custom className", () => {
    const { container } = render(
      <OdrlJsonHighlighter data={{ a: 1 }} className="mt-4" />,
    );
    const pre = container.querySelector("pre");
    expect(pre?.className).toContain("mt-4");
  });

  it("handles complex nested ODRL policy", () => {
    const complexPolicy = {
      "@type": "odrl:Set",
      "odrl:permission": [
        {
          "odrl:action": "odrl:use",
          "odrl:target": "urn:asset:fhir-r4",
          "odrl:assignee": "did:web:pharmaco.de:research",
          "odrl:constraint": [
            {
              "odrl:leftOperand": "edc:purpose",
              "odrl:operator": "odrl:isAnyOf",
              "odrl:rightOperand": ["research", "clinical-trial"],
            },
          ],
        },
      ],
      "odrl:prohibition": [
        {
          "odrl:action": "odrl:commercialize",
        },
      ],
    };
    const { container } = render(<OdrlJsonHighlighter data={complexPolicy} />);
    // Should have both ODRL and EDC highlighted spans
    expect(container.querySelectorAll(".text-cyan-400").length).toBeGreaterThan(
      0,
    );
    expect(
      container.querySelectorAll(".text-orange-400").length,
    ).toBeGreaterThan(0);
  });

  it("handles empty object", () => {
    render(<OdrlJsonHighlighter data={{}} />);
    // Should render without crashing
    expect(screen.getByText("{")).toBeInTheDocument();
  });
});
