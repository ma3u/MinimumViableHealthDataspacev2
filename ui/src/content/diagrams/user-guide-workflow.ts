/** /docs/user-guide, "Getting Started": the user workflow overview. A
 *  translation is a further key (de, fr, nl, es) with the same chart, its
 *  labels translated and its node ids unchanged (ADR-071). */
import type { ChartVariants } from "@/lib/i18n/diagrams";

const chart: ChartVariants = {
  en: `graph LR
  A[Sign in<br/>Keycloak or EUDI Wallet] --> O[Persona overview<br/>one view per role]
  O --> B{Choose task}
  B --> D[Browse<br/>Dataset Catalog]
  B --> E[Review<br/>Patient Journey]
  B --> F[Run<br/>Analytics]
  B --> G[Govern<br/>permits and supervision]
  D --> I[Search HealthDCAT-AP<br/>metadata]
  E --> J[View FHIR→OMOP<br/>timeline]
  F --> K[Cohort analytics<br/>dashboards]
  G --> L[EHDS Art. 57-69<br/>application to permit]`,
};

export default chart;
