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
  de: `graph LR
  subgraph "Stufe 1: Pre-commit (${facts.preCommitHooks.length} Hooks)"
    PC1["Prettier<br/>Automatische Formatierung"]
    PC2["TypeScript<br/>tsc --noEmit"]
    PC3["ESLint<br/>max. 55 Warnungen"]
    PC4["Semgrep<br/>Regel gegen Cypher-Injection"]
    PC5["ShellCheck + Hadolint"]
    PC6["Gitleaks<br/>Secret-Scan"]
  end

  subgraph "Stufe 2: Pre-push"
    PP1["Vitest<br/>--bail"]
    PP2["npm audit<br/>HIGH+ mit befristeten Ausnahmen"]
  end

  subgraph "Stufe 3: Pull Request"
    PR1["PR Gate<br/>Hooks auf dem Diff, API-Spec-Drift,<br/>Bruno-Abdeckung, knip"]
    CI1["Unit-Tests<br/>Vitest, UI + Proxy"]
    CI5["Trivy + Kubescape"]
    CI6["CodeQL + security-scan<br/>CVEs in Quellcode und Images"]
    CI7["E2E<br/>Playwright-Journeys"]
    CI8["WCAG 2.2 AA<br/>axe-core"]
  end

  subgraph "Stufe 4: Compliance (Untergrenzen)"
    CO1["DSP 2025-1 TCK<br/>≥ ${facts.complianceFloors["dsp-tck-results"].min_passed} bestanden"]
    CO2["DCP v1.0<br/>≥ ${facts.complianceFloors["dcp-compliance-results"].min_passed} bestanden"]
    CO3["EHDS-Domäne<br/>≥ ${facts.complianceFloors["ehds-compliance-results"].min_passed} bestanden"]
  end

  PC1 --> PC2 --> PC3
  PC4 --> PC5 --> PC6
  PC3 --> PP1 --> PP2
  PP2 --> PR1 & CI1 & CI5 & CI6
  CI1 --> CI7 --> CI8
  CI1 --> CO1 & CO2 & CO3`,
  fr: `graph LR
  subgraph "Étape 1 : pre-commit (${facts.preCommitHooks.length} hooks)"
    PC1["Prettier<br/>Formatage automatique"]
    PC2["TypeScript<br/>tsc --noEmit"]
    PC3["ESLint<br/>55 avertissements max."]
    PC4["Semgrep<br/>Règle contre l’injection Cypher"]
    PC5["ShellCheck + Hadolint"]
    PC6["Gitleaks<br/>Détection des secrets"]
  end

  subgraph "Étape 2 : pre-push"
    PP1["Vitest<br/>--bail"]
    PP2["npm audit<br/>HIGH+ avec exceptions limitées dans le temps"]
  end

  subgraph "Étape 3 : pull request"
    PR1["PR Gate<br/>hooks sur le diff, dérive de la spec API,<br/>couverture Bruno, knip"]
    CI1["Tests unitaires<br/>Vitest, UI + proxy"]
    CI5["Trivy + Kubescape"]
    CI6["CodeQL + security-scan<br/>CVE du code source et des images"]
    CI7["E2E<br/>parcours Playwright"]
    CI8["WCAG 2.2 AA<br/>axe-core"]
  end

  subgraph "Étape 4 : conformité (planchers)"
    CO1["DSP 2025-1 TCK<br/>≥ ${facts.complianceFloors["dsp-tck-results"].min_passed} réussis"]
    CO2["DCP v1.0<br/>≥ ${facts.complianceFloors["dcp-compliance-results"].min_passed} réussis"]
    CO3["Domaine EEDS<br/>≥ ${facts.complianceFloors["ehds-compliance-results"].min_passed} réussis"]
  end

  PC1 --> PC2 --> PC3
  PC4 --> PC5 --> PC6
  PC3 --> PP1 --> PP2
  PP2 --> PR1 & CI1 & CI5 & CI6
  CI1 --> CI7 --> CI8
  CI1 --> CO1 & CO2 & CO3`,
  nl: `graph LR
  subgraph "Fase 1: pre-commit (${facts.preCommitHooks.length} hooks)"
    PC1["Prettier<br/>Automatisch formatteren"]
    PC2["TypeScript<br/>tsc --noEmit"]
    PC3["ESLint<br/>max. 55 waarschuwingen"]
    PC4["Semgrep<br/>Regel tegen Cypher-injectie"]
    PC5["ShellCheck + Hadolint"]
    PC6["Gitleaks<br/>Secretscan"]
  end

  subgraph "Fase 2: pre-push"
    PP1["Vitest<br/>--bail"]
    PP2["npm audit<br/>HIGH+ met tijdgebonden uitzonderingen"]
  end

  subgraph "Fase 3: pull request"
    PR1["PR Gate<br/>hooks op de diff, API-spec-drift,<br/>Bruno-dekking, knip"]
    CI1["Unittests<br/>Vitest, UI + proxy"]
    CI5["Trivy + Kubescape"]
    CI6["CodeQL + security-scan<br/>CVE’s in broncode en images"]
    CI7["E2E<br/>Playwright-journeys"]
    CI8["WCAG 2.2 AA<br/>axe-core"]
  end

  subgraph "Fase 4: compliance (ondergrenzen)"
    CO1["DSP 2025-1 TCK<br/>≥ ${facts.complianceFloors["dsp-tck-results"].min_passed} geslaagd"]
    CO2["DCP v1.0<br/>≥ ${facts.complianceFloors["dcp-compliance-results"].min_passed} geslaagd"]
    CO3["EHDS-domein<br/>≥ ${facts.complianceFloors["ehds-compliance-results"].min_passed} geslaagd"]
  end

  PC1 --> PC2 --> PC3
  PC4 --> PC5 --> PC6
  PC3 --> PP1 --> PP2
  PP2 --> PR1 & CI1 & CI5 & CI6
  CI1 --> CI7 --> CI8
  CI1 --> CO1 & CO2 & CO3`,
  es: `graph LR
  subgraph "Etapa 1: pre-commit (${facts.preCommitHooks.length} hooks)"
    PC1["Prettier<br/>Formato automático"]
    PC2["TypeScript<br/>tsc --noEmit"]
    PC3["ESLint<br/>máx. 55 avisos"]
    PC4["Semgrep<br/>Regla contra la inyección de Cypher"]
    PC5["ShellCheck + Hadolint"]
    PC6["Gitleaks<br/>Búsqueda de secretos"]
  end

  subgraph "Etapa 2: pre-push"
    PP1["Vitest<br/>--bail"]
    PP2["npm audit<br/>HIGH+ con excepciones temporales"]
  end

  subgraph "Etapa 3: pull request"
    PR1["PR Gate<br/>hooks sobre el diff, deriva de la spec de la API,<br/>cobertura de Bruno, knip"]
    CI1["Pruebas unitarias<br/>Vitest, UI + proxy"]
    CI5["Trivy + Kubescape"]
    CI6["CodeQL + security-scan<br/>CVE del código fuente y de las imágenes"]
    CI7["E2E<br/>recorridos de Playwright"]
    CI8["WCAG 2.2 AA<br/>axe-core"]
  end

  subgraph "Etapa 4: cumplimiento (mínimos)"
    CO1["DSP 2025-1 TCK<br/>≥ ${facts.complianceFloors["dsp-tck-results"].min_passed} superadas"]
    CO2["DCP v1.0<br/>≥ ${facts.complianceFloors["dcp-compliance-results"].min_passed} superadas"]
    CO3["Dominio del EEDS<br/>≥ ${facts.complianceFloors["ehds-compliance-results"].min_passed} superadas"]
  end

  PC1 --> PC2 --> PC3
  PC4 --> PC5 --> PC6
  PC3 --> PP1 --> PP2
  PP2 --> PR1 & CI1 & CI5 & CI6
  CI1 --> CI7 --> CI8
  CI1 --> CO1 & CO2 & CO3`,
};

export default chart;
