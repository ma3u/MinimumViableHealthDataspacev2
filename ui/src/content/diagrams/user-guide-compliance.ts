/** /docs/user-guide, "Governance": the EHDS data access compliance
 *  workflow. A translation is a further key (de, fr, nl, es) with the same
 *  chart, its labels translated and its participant ids unchanged
 *  (ADR-071). */
import type { ChartVariants } from "@/lib/i18n/diagrams";

const chart: ChartVariants = {
  en: `sequenceDiagram
  participant USER as Research User
  participant UI as Compliance Portal
  participant HDAB as HDAB Authority
  participant DH as Data Holder

  USER->>UI: Start data access application
  UI->>UI: Select dataset from catalog
  UI->>HDAB: Submit permit request<br/>(EHDS Art. 67-68)
  HDAB->>HDAB: Review & approve
  HDAB-->>UI: Data permit issued (VC)
  UI->>DH: Initiate contract negotiation
  DH-->>UI: Contract agreement
  UI->>USER: Access granted<br/>with audit trail`,
};

export default chart;
