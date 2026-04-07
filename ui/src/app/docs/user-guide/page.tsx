"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Shield } from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";

const LIVE_URL = "https://ma3u.github.io/MinimumViableHealthDataspacev2";

const userWorkflowDiagram = `graph LR
  A[Login via<br/>Keycloak SSO] --> B{Choose Task}
  B --> C[Explore<br/>Knowledge Graph]
  B --> D[Browse<br/>Dataset Catalog]
  B --> E[Review<br/>Patient Journey]
  B --> F[Run<br/>Analytics]
  B --> G[Check<br/>Compliance]
  C --> H[Visualise 5-layer<br/>graph relationships]
  D --> I[Search HealthDCAT-AP<br/>metadata]
  E --> J[View FHIR→OMOP<br/>timeline]
  F --> K[Cohort analytics<br/>dashboards]
  G --> L[EHDS Art. 45-52<br/>approval chain]`;

const complianceDiagram = `sequenceDiagram
  participant USER as Research User
  participant UI as Compliance Portal
  participant HDAB as HDAB Authority
  participant DH as Data Holder

  USER->>UI: Start data access application
  UI->>UI: Select dataset from catalog
  UI->>HDAB: Submit permit request<br/>(EHDS Articles 45-49)
  HDAB->>HDAB: Review & approve
  HDAB-->>UI: Data permit issued (VC)
  UI->>DH: Initiate contract negotiation
  DH-->>UI: Contract agreement
  UI->>USER: Access granted<br/>with audit trail`;

/** Reusable screenshot card with caption and link to live page */
function ScreenshotCard({
  src,
  alt,
  href,
  title,
  children,
}: {
  src: string;
  alt: string;
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Image
          src={`/images/screenshots/${src}`}
          alt={alt}
          width={1200}
          height={675}
          className="w-full h-auto border-b border-[var(--border)]"
        />
      </a>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-lg font-semibold text-indigo-400">{title}</h3>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-secondary)] hover:text-indigo-400"
            title="Open live page"
          >
            <ExternalLink size={14} />
          </a>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function UserGuidePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6"
      >
        <ArrowLeft size={14} /> Back to Docs
      </Link>
      <h1 className="text-3xl font-bold mb-2">User Guide</h1>
      <p className="text-[var(--text-secondary)] mb-8">
        A practical guide for business users, researchers, and data stewards
        working with the Health Dataspace platform. Each section includes a
        screenshot, a description, and a link to the{" "}
        <a
          href={LIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 underline"
        >
          live demo
        </a>
        .
      </p>

      {/* ── 0. Personas & Roles ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">
          Personas &amp; Roles — Who Uses What?
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The platform adapts its navigation, graph view, and available actions
          to the signed-in user&apos;s EHDS role. Sign in at{" "}
          <code className="text-xs bg-[var(--surface-2)] px-1 py-0.5 rounded">
            /auth/signin
          </code>{" "}
          with any demo account — password equals username in local dev.
        </p>

        <ScreenshotCard
          src="ehds-signin-persona-cards.png"
          alt="EHDS Health Dataspace sign-in page showing five demo persona cards with role badges and graph persona IDs"
          href={`${LIVE_URL}/auth/signin`}
          title="Sign In — Demo Persona Cards"
        >
          <p className="text-[var(--text-secondary)] text-sm mb-3">
            The sign-in page lists every demo account with its role badge,
            organisation, and the graph persona view it will open after login.
            Clicking a card calls Keycloak SSO and redirects directly to the
            user&apos;s personalised graph.
          </p>

          {/* Demo users table */}
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th className="text-left py-1.5 pr-3">Username</th>
                  <th className="text-left py-1.5 pr-3">Organisation</th>
                  <th className="text-left py-1.5 pr-3">Role</th>
                  <th className="text-left py-1.5 pr-3">Graph view</th>
                  <th className="text-left py-1.5">Primary question</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    user: "edcadmin",
                    org: "Dataspace Operator",
                    role: "EDC Admin",
                    color: "text-red-400",
                    graph: "edc-admin",
                    q: "Who are my participants? What contracts are active?",
                  },
                  {
                    user: "clinicuser",
                    org: "AlphaKlinik Berlin",
                    role: "Data Holder",
                    color: "text-blue-400",
                    graph: "hospital",
                    q: "Who has approved access to my datasets?",
                  },
                  {
                    user: "lmcuser",
                    org: "Limburg Medical Centre",
                    role: "Data Holder",
                    color: "text-blue-400",
                    graph: "hospital",
                    q: "What contracts are active for my NL datasets?",
                  },
                  {
                    user: "researcher",
                    org: "PharmaCo Research AG",
                    role: "Researcher",
                    color: "text-green-400",
                    graph: "researcher",
                    q: "What datasets match my study protocol?",
                  },
                  {
                    user: "regulator",
                    org: "MedReg DE",
                    role: "HDAB Authority",
                    color: "text-amber-400",
                    graph: "hdab",
                    q: "What approvals are pending? Is the chain complete?",
                  },
                ].map((p) => (
                  <tr key={p.user} className="border-b border-[var(--border)]">
                    <td className="py-1.5 pr-3 font-mono font-semibold text-white">
                      {p.user}
                    </td>
                    <td className="py-1.5 pr-3 text-[var(--text-secondary)]">
                      {p.org}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`inline-flex items-center gap-1 ${p.color} font-medium`}
                      >
                        <Shield size={10} />
                        {p.role}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-[var(--text-secondary)]">
                      {p.graph}
                    </td>
                    <td className="py-1.5 text-[var(--text-secondary)] italic">
                      {p.q}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScreenshotCard>

        {/* Menu items per role */}
        <div className="mt-6 border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-lg font-semibold text-indigo-400 mb-3">
            Menu Items per Role
          </h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            Navigation is filtered by role — items not relevant to a user&apos;s
            function are hidden entirely.
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th className="text-left py-1.5 pr-2">Route</th>
                  <th className="text-center py-1.5 px-2">Public</th>
                  <th className="text-center py-1.5 px-2">
                    <span className="text-blue-400">Data Holder</span>
                  </th>
                  <th className="text-center py-1.5 px-2">
                    <span className="text-green-400">Researcher</span>
                  </th>
                  <th className="text-center py-1.5 px-2">
                    <span className="text-amber-400">HDAB</span>
                  </th>
                  <th className="text-center py-1.5 px-2">
                    <span className="text-red-400">EDC Admin</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["/graph", "✅", "✅", "✅", "✅", "✅"],
                  ["/catalog", "✅", "✅", "✅", "✅", "✅"],
                  ["/catalog/editor", "—", "✅", "—", "—", "✅"],
                  ["/patient", "✅", "✅", "✅", "✅", "✅"],
                  ["/analytics", "—", "—", "✅", "✅", "✅"],
                  ["/query (NLQ)", "—", "—", "✅", "✅", "✅"],
                  ["/eehrxf", "✅", "✅", "✅", "✅", "✅"],
                  ["/compliance", "—", "—", "—", "✅", "✅"],
                  ["/data/share", "—", "✅", "—", "—", "✅"],
                  ["/data/discover", "—", "—", "✅", "✅", "✅"],
                  ["/negotiate", "—", "✅", "✅", "—", "✅"],
                  ["/admin + /admin/*", "—", "—", "—", "—", "✅"],
                  ["/admin/policies + audit", "—", "—", "—", "✅", "✅"],
                  ["/docs", "✅", "✅", "✅", "✅", "✅"],
                ].map(([route, pub, dh, re, hdab, admin]) => (
                  <tr
                    key={route}
                    className="border-b border-[var(--border)]/50"
                  >
                    <td className="py-1 pr-2 font-mono text-[var(--text-primary)]">
                      {route}
                    </td>
                    {[pub, dh, re, hdab, admin].map((v, i) => (
                      <td
                        key={i}
                        className={`py-1 px-2 text-center ${
                          v === "✅" ? "text-green-400" : "text-gray-700"
                        }`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Persona graph views */}
        <div className="mt-6 border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-lg font-semibold text-indigo-400 mb-3">
            Graph Explorer — Persona Views
          </h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            The <strong>&ldquo;View as&rdquo;</strong> panel in the graph
            sidebar and the <strong>&ldquo;My graph view&rdquo;</strong> link in
            the UserMenu dropdown load a role-specific subgraph that answers
            each persona&apos;s primary question.
          </p>
          <div className="space-y-3">
            {[
              {
                param: "?persona=hospital",
                label: "Hospital / Data Holder",
                color: "text-blue-400",
                img: "graph-explorer-hospital-persona.png",
                q: "Who has approved access to my datasets?",
                nodes:
                  "Participant · HealthDataset · Contract · HDABApproval · EEHRxFProfile",
              },
              {
                param: "?persona=researcher",
                label: "Researcher / Data User",
                color: "text-green-400",
                img: "graph-explorer-researcher-persona.png",
                q: "What datasets match my study? What OMOP analytics can I run?",
                nodes:
                  "HealthDataset · OMOPPerson · SnomedConcept · SPESession",
              },
              {
                param: "?persona=hdab",
                label: "HDAB Authority",
                color: "text-amber-400",
                img: "graph-explorer-hdab-persona.png",
                q: "What approvals are pending? Is the governance chain complete?",
                nodes:
                  "HDABApproval · VerifiableCredential · TrustCenter · AccessApplication",
              },
              {
                param: "?persona=trust-center",
                label: "Trust Center Operator",
                color: "text-violet-400",
                img: "graph-explorer-trust-center-persona.png",
                q: "Which pseudonym resolution flows am I managing?",
                nodes:
                  "TrustCenter · SPESession · ResearchPseudonym · ProviderPseudonym",
              },
              {
                param: "?persona=edc-admin",
                label: "EDC Admin",
                color: "text-red-400",
                img: "graph-explorer-edc-admin-persona.png",
                q: "Who are my participants? What contracts and transfers are live?",
                nodes: "Participant · DataProduct · Contract · TransferEvent",
              },
            ].map((p) => (
              <div
                key={p.param}
                className="border border-[var(--border)] rounded-lg overflow-hidden"
              >
                <a
                  href={`${LIVE_URL}/graph${p.param}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Image
                    src={`/images/screenshots/${p.img}`}
                    alt={`${p.label} graph view`}
                    width={1440}
                    height={900}
                    className="w-full h-auto border-b border-[var(--border)]"
                  />
                </a>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-semibold text-sm ${p.color}`}>
                      {p.label}
                    </span>
                    <code className="text-xs text-[var(--text-secondary)] font-mono">
                      /graph{p.param}
                    </code>
                  </div>
                  <p className="text-[var(--text-secondary)] text-xs italic mb-1">
                    &ldquo;{p.q}&rdquo;
                  </p>
                  <p className="text-gray-600 text-xs">
                    Focus nodes: {p.nodes}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 1. Getting Started ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">Getting Started</h2>
        <MermaidDiagram
          chart={userWorkflowDiagram}
          caption="User workflow overview"
        />
        <p className="text-[var(--text-secondary)] text-sm mt-3 mb-6">
          After authenticating through Keycloak SSO, you land on the graph view
          personalised for your role. You can also browse datasets, review
          patient timelines, run analytics, or check EHDS compliance. The{" "}
          <strong>UserMenu</strong> (top-right) shows your role badge and a
          &ldquo;My graph view&rdquo; shortcut to your persona graph.
        </p>

        <div className="space-y-6">
          <ScreenshotCard
            src="ehds-health-dataspace-home-dashboard.png"
            alt="EHDS Health Dataspace home dashboard showing participant overview, dataspace statistics, and quick action cards"
            href={LIVE_URL}
            title="Home Dashboard"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              The landing page presents a high-level overview of the dataspace:
              active participants, registered datasets, and recent transfers.
              Quick-action cards let you jump to common tasks.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG logs in and sees 5 active
              participants, 3 published datasets, and a pending contract
              negotiation with AlphaKlinik Berlin.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="ehds-participant-onboarding-wizard.png"
            alt="EHDS participant onboarding wizard with step-by-step registration form for dataspace membership"
            href={`${LIVE_URL}/onboarding`}
            title="Participant Onboarding"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              The onboarding wizard guides new participants through dataspace
              registration: creating a DID identity, registering with the
              Credential Federated Manager, and enrolling in the federated
              catalog.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: Limburg Medical Centre joins the EHDS dataspace by
              providing its organization details, generating{" "}
              <code className="text-xs">did:web:lmc.nl:clinic</code>, and
              obtaining a MembershipCredential.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="ehds-participant-settings-credentials.png"
            alt="EHDS participant settings page showing verifiable credentials, DID configuration, and connector status"
            href={`${LIVE_URL}/settings`}
            title="Participant Settings"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              View and manage your participant profile, verifiable credentials
              (MembershipCredential, EHDSParticipantCredential), connector
              endpoints, and Keycloak SSO configuration.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: AlphaKlinik Berlin checks that both its
              MembershipCredential and EHDSParticipantCredential are active and
              not expired before publishing a new dataset.
            </p>
          </ScreenshotCard>
        </div>
      </section>

      {/* ── 2. Explore ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Explore</h2>
        <div className="space-y-6">
          <ScreenshotCard
            src="neo4j-health-dataspace-graph-explorer.png"
            alt="Neo4j health dataspace graph explorer showing 5-layer knowledge graph with colour-coded nodes for Marketplace, HealthDCAT-AP, FHIR, OMOP, and Ontology layers"
            href={`${LIVE_URL}/graph`}
            title="Graph Explorer"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              The force-directed graph visualisation displays all five
              architecture layers of the knowledge graph. Nodes are colour-coded
              by layer: <span className="text-blue-400">Marketplace</span>,{" "}
              <span className="text-green-400">HealthDCAT-AP</span>,{" "}
              <span className="text-yellow-400">FHIR R4</span>,{" "}
              <span className="text-orange-400">OMOP CDM</span>, and{" "}
              <span className="text-purple-400">Ontology</span>.
            </p>
            <ul className="text-[var(--text-secondary)] text-sm space-y-1 ml-4 list-disc">
              <li>Click nodes to see properties and related entities</li>
              <li>Use the layer toggle to filter visible layers</li>
              <li>Zoom and pan with mouse controls</li>
              <li>Search bar finds specific nodes across all layers</li>
            </ul>
            <p className="text-[var(--text-secondary)] text-xs italic mt-2">
              Example: A researcher explores how a FHIR Patient resource
              connects to OMOP Person and condition_occurrence records via the
              SNOMED ontology layer.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="ehds-fhir-dataset-catalog-browser.png"
            alt="EHDS FHIR dataset catalog browser with HealthDCAT-AP metadata cards showing publisher, coverage, and distribution formats"
            href={`${LIVE_URL}/catalog`}
            title="Dataset Catalog"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Browse and search HealthDCAT-AP metadata records for all published
              datasets. Each entry shows title, description, publisher,
              temporal/spatial coverage, and distribution formats.
            </p>
            <ul className="text-[var(--text-secondary)] text-sm space-y-1 ml-4 list-disc">
              <li>Filter by publisher, theme, or keyword</li>
              <li>View distribution endpoints (FHIR, OMOP, bulk export)</li>
              <li>Check data quality metrics (DQV dimensions)</li>
              <li>Initiate data access requests from catalog entries</li>
            </ul>
            <p className="text-[var(--text-secondary)] text-xs italic mt-2">
              Example: PharmaCo Research AG searches for &quot;diabetes&quot;
              datasets and finds AlphaKlinik Berlin&apos;s Type 2 Diabetes
              Cohort with FHIR R4 and OMOP CDM distributions.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="fhir-patient-journey-timeline-view.png"
            alt="FHIR patient journey timeline view showing clinical events, encounters, conditions, and medications mapped to OMOP CDM"
            href={`${LIVE_URL}/patient`}
            title="Patient Journey"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              View the clinical timeline for synthetic patients, showing FHIR R4
              resources (Encounters, Conditions, Observations, Medications,
              Procedures) mapped to their OMOP CDM equivalents.
            </p>
            <ul className="text-[var(--text-secondary)] text-sm space-y-1 ml-4 list-disc">
              <li>Select patients from the patient list</li>
              <li>Timeline displays events chronologically</li>
              <li>Toggle between FHIR and OMOP views</li>
              <li>Explore SNOMED/LOINC/RxNorm concept mappings</li>
            </ul>
            <p className="text-[var(--text-secondary)] text-xs italic mt-2">
              Example: A data steward reviews the timeline for a synthetic
              patient with hypertension, verifying that the FHIR Condition
              correctly maps to OMOP condition_occurrence with SNOMED code
              38341003.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="omop-cdm-analytics-dashboard.png"
            alt="OMOP CDM analytics dashboard showing cohort demographics, condition prevalence charts, and drug exposure analysis"
            href={`${LIVE_URL}/analytics`}
            title="OMOP Analytics"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Cohort-level research analytics powered by the OMOP CDM layer. Run
              aggregate queries across conditions, measurements, drug exposures,
              and procedures.
            </p>
            <ul className="text-[var(--text-secondary)] text-sm space-y-1 ml-4 list-disc">
              <li>View condition prevalence and demographics</li>
              <li>Analyse drug exposure patterns</li>
              <li>Run cohort characterisation queries</li>
              <li>Export results for further analysis</li>
            </ul>
            <p className="text-[var(--text-secondary)] text-xs italic mt-2">
              Example: PharmaCo Research AG runs a cohort query to identify
              patients with Type 2 Diabetes who received Metformin, showing age
              and gender distribution across the cohort.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="ehds-natural-language-federated-query.png"
            alt="EHDS natural language federated query interface for executing cross-participant queries using plain language"
            href={`${LIVE_URL}/query`}
            title="Natural Language / Federated Query"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Execute cross-participant queries using natural language or
              structured query syntax. The query engine translates requests into
              federated SPARQL/Cypher queries across connected dataspace nodes.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: A researcher types &quot;How many patients with
              hypertension are older than 65?&quot; and the system queries both
              AlphaKlinik Berlin and Limburg Medical Centre, returning
              aggregated results without moving raw data.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="eehrxf-exchange-format-profiles.png"
            alt="EEHRxF exchange format profiles showing EHDS priority category alignment and FHIR profile coverage analysis"
            href={`${LIVE_URL}/eehrxf`}
            title="EEHRxF Profiles"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              European EHR Exchange Format profile alignment view. Analyse which
              FHIR profiles satisfy EHDS priority categories (Patient Summary,
              ePrescription, Laboratory Results, Medical Imaging, Hospital
              Discharge) and identify coverage gaps.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: MedReg DE reviews AlphaKlinik Berlin&apos;s profile
              coverage and sees that Patient Summary and Laboratory Results are
              fully aligned, while ePrescription has one missing profile.
            </p>
          </ScreenshotCard>
        </div>
      </section>

      {/* ── 3. Governance ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">Governance</h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The governance modules manage EHDS compliance, protocol testing, and
          verifiable credential issuance as required by the European Health Data
          Space regulation (Articles 45–52).
        </p>
        <MermaidDiagram
          chart={complianceDiagram}
          caption="EHDS data access compliance workflow"
        />

        <div className="space-y-6 mt-6">
          <ScreenshotCard
            src="ehds-data-access-approval-workflow.png"
            alt="EHDS data access approval workflow showing permit application status, HDAB review steps, and approval timeline"
            href={`${LIVE_URL}/compliance`}
            title="EHDS Approval"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Manage data access permits as required by EHDS Articles 45–49.
              Data users submit applications, HDABs review and approve, and
              verifiable credentials are issued as proof of authorization.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG submits a data access application
              for the diabetes cohort. MedReg DE (HDAB) reviews the request,
              approves it under Art. 46, and a DataPermitCredential is issued.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="dsp-protocol-tck-compliance-tests.png"
            alt="DSP protocol TCK compliance test results showing 20/20 passing tests for catalog, negotiation, and transfer protocols"
            href={`${LIVE_URL}/compliance/tck`}
            title="Protocol TCK"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              The Technology Compatibility Kit validates that your EDC connector
              implements the Dataspace Protocol (DSP) correctly. Tests cover
              catalog queries, contract negotiations, and transfer processes.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: The operator runs the TCK suite and confirms 20/20 tests
              passing — verifying DSP-compliant catalog, negotiation, and
              transfer process implementations.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="ehds-verifiable-credentials-overview.png"
            alt="EHDS verifiable credentials overview showing MembershipCredential and EHDSParticipantCredential for all participants"
            href={`${LIVE_URL}/credentials`}
            title="Verifiable Credentials"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              View and manage verifiable credentials across all dataspace
              participants. Each participant holds a MembershipCredential and an
              EHDSParticipantCredential, issued by the trusted issuer service.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: The operator verifies that all 5 participants
              (AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg
              Medical Centre, Institut de Recherche Santé) each hold 2 active
              credentials.
            </p>
          </ScreenshotCard>
        </div>
      </section>

      {/* ── 4. Data Exchange ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="data-exchange">
          Data Exchange
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The sovereign data exchange pipeline follows the Dataspace Protocol:
          share assets → discover via federated catalog → negotiate contracts →
          manage tasks → transfer data.
        </p>

        <div className="space-y-6">
          <ScreenshotCard
            src="ehds-share-data-asset-registration.png"
            alt="EHDS share data page showing asset registration form with HealthDCAT-AP metadata and ODRL access policies"
            href={`${LIVE_URL}/data/share`}
            title="Share Data"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Publish datasets with HealthDCAT-AP metadata and ODRL access
              policies for the federated catalog. Define distribution endpoints,
              data quality attributes, and usage constraints.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: AlphaKlinik Berlin publishes a &quot;Synthetic Diabetes
              Cohort&quot; dataset with FHIR R4 bulk export distribution, EHDS
              Art. 33 usage policy, and spatial coverage set to DE.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="ehds-federated-catalog-discovery.png"
            alt="EHDS federated catalog discovery page showing cross-participant dataset search results with metadata previews"
            href={`${LIVE_URL}/data/discover`}
            title="Discover"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Search the federated catalog across all connected dataspace
              participants. Results aggregate datasets from multiple EDC
              connectors, showing availability and access terms.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG discovers 3 datasets across 2
              participants for &quot;cardiovascular&quot; research — one from
              AlphaKlinik Berlin and two from Limburg Medical Centre.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="edc-contract-negotiation-manager.png"
            alt="EDC contract negotiation manager showing active negotiations, agreement status, and ODRL policy terms"
            href={`${LIVE_URL}/negotiate`}
            title="Negotiate"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Initiate and track DSP contract negotiations with data holders.
              View negotiation state (REQUESTED → AGREED → VERIFIED →
              FINALIZED), ODRL policy terms, and counter-offer history.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG initiates a contract negotiation
              with AlphaKlinik Berlin for the diabetes cohort. The negotiation
              progresses to FINALIZED with an EHDS Art. 33(c) research use
              policy.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="ehds-data-transfer-task-queue.png"
            alt="EHDS data transfer task queue showing pending and active transfer tasks with progress indicators"
            href={`${LIVE_URL}/tasks`}
            title="Tasks"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Monitor the task queue for pending and active data transfer
              operations. Tasks track the full lifecycle from initiation through
              provisioning to completion.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: The operator monitors a bulk FHIR export task from
              AlphaKlinik Berlin to PharmaCo Research AG — currently at the
              provisioning stage with an estimated 2-minute completion time.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="edc-data-transfer-history-log.png"
            alt="EDC data transfer history log showing completed transfers with timestamps, data sizes, and audit trail links"
            href={`${LIVE_URL}/data/transfer`}
            title="Transfer"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              View the complete history of data transfers — both initiated and
              received. Each entry includes timestamps, transfer size, protocol
              used, and a link to the audit trail.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG reviews its transfer history showing
              a completed 12 MB FHIR bulk export from AlphaKlinik Berlin,
              transferred via HTTP-PUSH with full W3C PROV audit trail.
            </p>
          </ScreenshotCard>
        </div>
      </section>

      {/* ── 5. Administration ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="admin">
          Administration
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          Platform administrators can manage tenants, access policies, and audit
          logs. The admin dashboard provides an overview of system health,
          active connections, and recent activity. Access requires the admin
          role assigned through Keycloak.
        </p>

        <div className="space-y-6">
          <ScreenshotCard
            src="ehds-operator-admin-dashboard.png"
            alt="EHDS operator admin dashboard showing system health, active participant connections, and recent activity metrics"
            href={`${LIVE_URL}/admin`}
            title="Operator Dashboard"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              The admin dashboard shows system health at a glance: connector
              uptime, active participants, recent negotiations, transfer
              throughput, and credential status.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: The operator sees all 5 participants are online, 3
              contract negotiations are active, and 12 transfers completed in
              the last 24 hours with no failures.
            </p>
          </ScreenshotCard>

          <ScreenshotCard
            src="edc-connector-components-overview.png"
            alt="EDC connector components overview showing control plane, data plane, identity hub, and credential service status"
            href={`${LIVE_URL}/admin/components`}
            title="EDC Components"
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Inspect the runtime status of Eclipse Dataspace Connector
              components — Control Plane, Data Plane, Identity Hub, Issuer
              Service, and Credential Federated Manager. View health checks,
              versions, and configuration details.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: The operator checks that the Control Plane (port 19193),
              Data Plane (port 19195), and Identity Hub (port 17171) are all
              reporting healthy status for AlphaKlinik Berlin&apos;s connector.
            </p>
          </ScreenshotCard>
        </div>
      </section>

      {/* ── Help ── */}
      <section className="bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl p-6">
        <h2 className="font-semibold mb-2">Need Help?</h2>
        <p className="text-[var(--text-secondary)] text-sm">
          For technical questions, see the{" "}
          <Link
            href="/docs/developer"
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            Developer Guide
          </Link>
          . For architecture details, visit the{" "}
          <Link
            href="/docs/architecture"
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            Architecture Diagrams
          </Link>
          . Try the live demo at{" "}
          <a
            href={LIVE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            GitHub Pages
          </a>
          .
        </p>
      </section>
    </div>
  );
}
