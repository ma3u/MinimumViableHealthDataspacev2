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
  de: `graph LR
  A[Anmelden<br/>Keycloak oder EUDI-Wallet] --> O[Persona-Übersicht<br/>eine Ansicht je Rolle]
  O --> B{Aufgabe wählen}
  B --> D[Durchsuchen<br/>Datensatzkatalog]
  B --> E[Prüfen<br/>Patientenreise]
  B --> F[Ausführen<br/>Analysen]
  B --> G[Steuern<br/>Datengenehmigungen und Aufsicht]
  D --> I[HealthDCAT-AP-Metadaten<br/>durchsuchen]
  E --> J[FHIR→OMOP-Zeitleiste<br/>ansehen]
  F --> K[Kohortenanalysen<br/>Dashboards]
  G --> L[EHDS Art. 57-69<br/>vom Antrag zur Datengenehmigung]`,
  fr: `graph LR
  A[Se connecter<br/>Keycloak ou portefeuille EUDI] --> O[Vue d’ensemble des personas<br/>une vue par rôle]
  O --> B{Choisir une tâche}
  B --> D[Parcourir<br/>Catalogue des ensembles de données]
  B --> E[Examiner<br/>Parcours patient]
  B --> F[Lancer<br/>Analyses]
  B --> G[Gouverner<br/>autorisations et supervision]
  D --> I[Rechercher les métadonnées<br/>HealthDCAT-AP]
  E --> J[Voir la chronologie<br/>FHIR→OMOP]
  F --> K[Analyses de cohortes<br/>tableaux de bord]
  G --> L[EEDS art. 57 à 69<br/>de la demande à l’autorisation de traitement de données]`,
  nl: `graph LR
  A[Aanmelden<br/>Keycloak of EUDI-wallet] --> O[Personaoverzicht<br/>één weergave per rol]
  O --> B{Taak kiezen}
  B --> D[Bladeren<br/>Catalogus van datasets]
  B --> E[Bekijken<br/>Patiëntreis]
  B --> F[Uitvoeren<br/>Analyses]
  B --> G[Besturen<br/>vergunningen en toezicht]
  D --> I[HealthDCAT-AP-metadata<br/>doorzoeken]
  E --> J[FHIR→OMOP-tijdlijn<br/>bekijken]
  F --> K[Cohortanalyses<br/>dashboards]
  G --> L[EHDS art. 57-69<br/>van aanvraag tot gegevensvergunning]`,
  es: `graph LR
  A[Iniciar sesión<br/>Keycloak o cartera EUDI] --> O[Resumen de personas<br/>una vista por rol]
  O --> B{Elegir tarea}
  B --> D[Explorar<br/>Catálogo de conjuntos de datos]
  B --> E[Revisar<br/>Recorrido del paciente]
  B --> F[Ejecutar<br/>Análisis]
  B --> G[Gobernar<br/>permisos y supervisión]
  D --> I[Buscar metadatos<br/>HealthDCAT-AP]
  E --> J[Ver la cronología<br/>FHIR→OMOP]
  F --> K[Análisis de cohortes<br/>paneles]
  G --> L[EEDS art. 57 a 69<br/>de la solicitud al permiso de datos]`,
};

export default chart;
