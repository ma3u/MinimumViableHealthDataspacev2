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
  de: `sequenceDiagram
  participant USER as Forschende
  participant UI as Compliance-Portal
  participant HDAB as Zugangsstelle für Gesundheitsdaten
  participant DH as Gesundheitsdateninhaber

  USER->>UI: Antrag auf Zugang zu Gesundheitsdaten starten
  UI->>UI: Datensatz aus dem Katalog wählen
  UI->>HDAB: Antrag auf Datengenehmigung einreichen<br/>(EHDS Art. 67-68)
  HDAB->>HDAB: Prüfen und genehmigen
  HDAB-->>UI: Datengenehmigung erteilt (VC)
  UI->>DH: Vertragsverhandlung starten
  DH-->>UI: Vertragsvereinbarung
  UI->>USER: Zugang gewährt<br/>mit Audit-Trail`,
  fr: `sequenceDiagram
  participant USER as Chercheur
  participant UI as Portail de conformité
  participant HDAB as Organisme responsable de l’accès aux données de santé
  participant DH as Détenteur de données de santé

  USER->>UI: Lancer une demande d’accès aux données de santé
  UI->>UI: Choisir un ensemble de données dans le catalogue
  UI->>HDAB: Soumettre la demande d’autorisation<br/>(EEDS art. 67 et 68)
  HDAB->>HDAB: Examen et approbation
  HDAB-->>UI: Autorisation de traitement de données délivrée (VC)
  UI->>DH: Lancer la négociation du contrat
  DH-->>UI: Accord contractuel
  UI->>USER: Accès accordé<br/>avec piste d’audit`,
  nl: `sequenceDiagram
  participant USER as Onderzoeker
  participant UI as Complianceportaal
  participant HDAB as Instantie voor toegang tot gezondheidsgegevens
  participant DH as Houder van gezondheidsgegevens

  USER->>UI: Aanvraag voor toegang tot gezondheidsgegevens starten
  UI->>UI: Dataset uit de catalogus kiezen
  UI->>HDAB: Vergunningsaanvraag indienen<br/>(EHDS art. 67-68)
  HDAB->>HDAB: Beoordelen en goedkeuren
  HDAB-->>UI: Gegevensvergunning verleend (VC)
  UI->>DH: Contractonderhandeling starten
  DH-->>UI: Contractovereenkomst
  UI->>USER: Toegang verleend<br/>met audittrail`,
  es: `sequenceDiagram
  participant USER as Investigador
  participant UI as Portal de cumplimiento
  participant HDAB as Organismo de acceso a datos de salud
  participant DH as Tenedor de datos de salud

  USER->>UI: Iniciar una solicitud de acceso a datos de salud
  UI->>UI: Elegir un conjunto de datos del catálogo
  UI->>HDAB: Presentar la solicitud de permiso<br/>(EEDS art. 67 y 68)
  HDAB->>HDAB: Revisión y aprobación
  HDAB-->>UI: Permiso de datos concedido (VC)
  UI->>DH: Iniciar la negociación del contrato
  DH-->>UI: Acuerdo contractual
  UI->>USER: Acceso concedido<br/>con registro de auditoría`,
};

export default chart;
