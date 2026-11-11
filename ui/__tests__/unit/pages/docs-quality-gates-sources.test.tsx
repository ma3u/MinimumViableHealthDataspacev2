/**
 * The quality-gates page maps each gate to a criterion, and an audit found
 * most of those mappings wrong: C5 DEV-02 (outsourced development) for lint,
 * DEV-03 (change policies) for unit tests, OPS-04 (malware) for the SBOM,
 * OPS-01 (capacity) for Kubescape, EHDS "Art. 50" from the proposal, CRA
 * Art. 13(5) (third-party due diligence) for the SBOM, CRA Art. 14 for
 * dependency freshness, WCAG SC 2.2.1 for a performance budget. These tests
 * pin the corrected mappings to their sources: every C5 criterion links to
 * its page in the BSI C5:2020 PDF, articles link to EUR-Lex, and the DSP and
 * DCP suites are not called a TCK.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/MermaidDiagram", () => ({
  default: () => <div data-testid="mermaid" />,
}));
vi.mock("@/components/docs/DocsLastUpdated", () => ({
  DocsLastUpdated: () => null,
}));

import QualityGatesPage from "@/app/docs/developer/quality-gates/page";
import ApiPage from "@/app/docs/developer/api/page";

/** The C5:2020 PDF page of each criterion the page cites. */
const C5_PAGE: Record<string, number> = {
  "AM-01": 48,
  "OPS-22": 72,
  "OPS-23": 73,
  "CRY-04": 83,
  "DEV-01": 91,
  "DEV-06": 94,
  "DEV-09": 95,
  "PSS-02": 114,
};

const links = () =>
  [...document.querySelectorAll("a")].map((a) => ({
    text: a.textContent?.trim() ?? "",
    href: a.getAttribute("href") ?? "",
  }));

describe("the quality-gates page's mappings", () => {
  it("links every C5 criterion to its page in the C5:2020 catalogue", () => {
    render(<QualityGatesPage />);
    const c5 = links().filter((l) => /^C5 [A-Z]{2,3}-\d\d$/.test(l.text));
    expect(c5.length).toBeGreaterThan(15);
    for (const l of c5) {
      const id = l.text.slice(3);
      expect(
        Object.keys(C5_PAGE),
        `${id} is not a criterion this page may cite`,
      ).toContain(id);
      expect(l.href).toContain("C5_2020.pdf");
      expect(l.href.endsWith(`#page=${C5_PAGE[id]}`), id).toBe(true);
    }
  });

  it("no longer cites the criteria and articles the audit found wrong", () => {
    const { container } = render(<QualityGatesPage />);
    const text = container.textContent ?? "";
    for (const wrong of [
      "DEV-02",
      "DEV-03",
      "DEV-05",
      "DEV-07",
      "DEV-08",
      "OPS-01",
      "OPS-04",
      "Art. 50",
      "Art. 3–51",
      "Art. 44",
      "13(5)",
      "Art. 14",
      "SC 2.2.1",
      "SC2.2.1",
      "§3",
      "SIMPL-Open",
      "Testing Guide",
    ]) {
      expect(text, wrong).not.toContain(wrong);
    }
  });

  it("links the regulations at the article that says it", () => {
    render(<QualityGatesPage />);
    const hrefs = links().map((l) => l.href);
    const cra = "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng";
    const ehds = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";
    expect(hrefs).toContain(`${cra}#anx_I`);
    expect(hrefs).toContain(`${cra}#013.024`);
    expect(hrefs).toContain(`${cra}#071.002`);
    expect(hrefs).toContain(`${ehds}#art_53`);
    expect(hrefs).toContain(`${ehds}#art_71`);
    expect(hrefs).toContain(`${ehds}#art_66`);
    expect(hrefs).toContain(
      "https://www.w3.org/TR/odrl-model/#x2-odrl-information-model",
    );
  });

  it("names the OWASP edition and links each category to it", () => {
    render(<QualityGatesPage />);
    const owasp = links().filter((l) => l.text.startsWith("OWASP A"));
    expect(owasp.length).toBeGreaterThan(5);
    for (const l of owasp) {
      expect(l.text).toMatch(/^OWASP A\d\d:2021$/);
      expect(l.href).toMatch(/^https:\/\/top10\.owasp\.org\/2021\/A\d\d_2021-/);
    }
  });

  it("does not call the hub's own DSP and DCP checks a TCK", () => {
    render(<QualityGatesPage />);
    expect(screen.queryByText(/DSP 2025-1 TCK/)).toBeNull();
    const tcks = links().filter((l) => /TCK/.test(l.text));
    expect(tcks.map((l) => l.href)).toEqual(
      expect.arrayContaining([
        "https://github.com/eclipse-dataspacetck/dsp-tck/releases/tag/v1.0.2",
        "https://github.com/eclipse-dataspacetck/dcp-tck/releases",
      ]),
    );
  });

  it("says which CycloneDX version CI makes and which the committed bills use", () => {
    render(<QualityGatesPage />);
    const hrefs = links().map((l) => l.href);
    expect(hrefs).toContain("https://cyclonedx.org/docs/1.5/json/");
    expect(hrefs).toContain("https://cyclonedx.org/docs/1.7/json/");
  });

  it("links repository files at their lines on main", () => {
    render(<QualityGatesPage />);
    const repoLinks = links().filter((l) =>
      l.href.startsWith(
        "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/",
      ),
    );
    expect(repoLinks.length).toBeGreaterThan(25);
    for (const l of repoLinks) {
      expect(l.href, l.text).toMatch(/blob\/main\/[^#\s]+(#L\d+(-L\d+)?)?$/);
    }
  });
});

describe("the interactive API reference page", () => {
  it("links each specification, ADR and component it names", () => {
    render(<ApiPage />);
    const hrefs = links().map((l) => l.href);
    for (const href of [
      "https://spec.openapis.org/oas/v3.1.0.html",
      "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
      "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
      "https://hl7.org/fhir/R4/",
      "https://ohdsi.github.io/CommonDataModel/cdm54.html",
      "https://data.health.europa.eu/healthdcat-ap/releases/release-8/",
    ]) {
      expect(hrefs).toContain(href);
    }
    // The connector the protocols run on: the launchers this repo builds.
    expect(hrefs.some((h) => h.endsWith("runtimes/edc/README.md"))).toBe(true);
    expect(hrefs.some((h) => h.includes("ADR-044-every-api-route"))).toBe(true);
    expect(hrefs.some((h) => h.includes("ADR-054-klarbefund"))).toBe(true);
  });
});
