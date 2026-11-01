/** /docs/developer/quality-gates, "Pipeline Overview": the four-stage
 *  quality pipeline. The counts come from docs-facts.json, so a translation
 *  (a further key: de, fr, nl, es) keeps the same ${...} expressions and
 *  node ids and translates the labels only (ADR-071). */
import facts from "@/app/docs/docs-facts.json";
import type { ChartVariants } from "@/lib/i18n/diagrams";

const chart: ChartVariants = {
  en: `graph LR
  subgraph "Stage 1 — Pre-commit (${facts.preCommitHooks.length} hooks)"
    PC1["Prettier<br/>Auto-format"]
    PC2["TypeScript<br/>tsc --noEmit"]
    PC3["ESLint<br/>max 55 warnings"]
    PC4["Semgrep<br/>Cypher injection rule"]
    PC5["ShellCheck + Hadolint"]
    PC6["Gitleaks<br/>Secret scan"]
  end

  subgraph "Stage 2 — Pre-push"
    PP1["Vitest<br/>--bail"]
    PP2["npm audit<br/>HIGH+ with time-boxed exceptions"]
  end

  subgraph "Stage 3 — Pull request"
    PR1["PR Gate<br/>hooks on the diff, API spec drift,<br/>Bruno coverage, knip"]
    CI1["Unit tests<br/>Vitest, UI + proxy"]
    CI5["Trivy + Kubescape"]
    CI6["CodeQL + security-scan<br/>source and image CVEs"]
    CI7["E2E<br/>Playwright journeys"]
    CI8["WCAG 2.2 AA<br/>axe-core"]
  end

  subgraph "Stage 4 — Compliance (floors)"
    CO1["DSP 2025-1 TCK<br/>≥ ${facts.complianceFloors["dsp-tck-results"].min_passed} passed"]
    CO2["DCP v1.0<br/>≥ ${facts.complianceFloors["dcp-compliance-results"].min_passed} passed"]
    CO3["EHDS domain<br/>≥ ${facts.complianceFloors["ehds-compliance-results"].min_passed} passed"]
  end

  PC1 --> PC2 --> PC3
  PC4 --> PC5 --> PC6
  PC3 --> PP1 --> PP2
  PP2 --> PR1 & CI1 & CI5 & CI6
  CI1 --> CI7 --> CI8
  CI1 --> CO1 & CO2 & CO3`,
};

export default chart;
