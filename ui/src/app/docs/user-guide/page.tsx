"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Shield,
  AlertTriangle,
  Globe,
  Database,
  Search,
  BarChart3,
  MessageSquare,
  FileCheck,
  TestTube,
  Award,
  Share2,
  Compass,
  Handshake,
  ClipboardList,
  ArrowLeftRight,
  LayoutDashboard,
  Settings,
  Cpu,
  UserPlus,
  Users,
  BookOpen,
} from "lucide-react";

const LIVE_URL = "https://ma3u.github.io/MinimumViableHealthDataspacev2";
const AZURE_URL = "https://ehds.mabu.red";

const FULL_JOURNEY_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/FULL_USER_JOURNEY.md";

import MermaidDiagram from "@/components/MermaidDiagram";

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

/** Reusable card linking to a feature page */
function FeatureCard({
  href,
  title,
  icon: Icon,
  requiresJAD,
  children,
}: {
  href: string;
  title: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  requiresJAD?: boolean;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith("http");
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden hover:border-indigo-500/50 transition-colors">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Icon
                size={18}
                className="text-indigo-700 dark:text-indigo-400"
              />
            </div>
            <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400">
              {title}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {requiresJAD && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/30 font-medium">
                JAD Stack
              </span>
            )}
            {isExternal ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
              >
                Open <ExternalLink size={12} />
              </a>
            ) : (
              <Link
                href={href}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
              >
                Try it <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Table of Contents section IDs */
const TOC_SECTIONS = [
  { id: "purpose", label: "Purpose" },
  { id: "personas", label: "Personas & Roles" },
  { id: "getting-started", label: "Getting Started" },
  { id: "explore", label: "Explore" },
  { id: "governance", label: "Governance" },
  { id: "data-exchange", label: "Data Exchange" },
  { id: "admin", label: "Administration" },
  { id: "help", label: "Need Help?" },
] as const;

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
      <p className="text-[var(--text-secondary)] mb-4">
        A practical guide for business users, researchers, and data stewards
        working with the Health Dataspace platform. Each section links directly
        to the feature page in the{" "}
        <a
          href={LIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
        >
          live demo
        </a>
        . For a complete end-to-end walkthrough covering every persona and
        workflow, see the{" "}
        <a
          href={FULL_JOURNEY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
        >
          Full User Journey
          <ExternalLink size={12} />
        </a>
        .
      </p>

      {/* ── Table of Contents ── */}
      <nav className="mb-10 border border-[var(--border)] rounded-xl p-5 bg-[var(--surface-2)]/30">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <BookOpen
            size={16}
            className="text-indigo-700 dark:text-indigo-400"
          />
          Table of Contents
        </h2>
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
          {TOC_SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-[var(--text-secondary)] hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
              >
                <span className="font-mono text-xs text-[var(--text-secondary)] mr-1">
                  {i + 1}.
                </span>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Dynamic Feature Notice ── */}
      <div className="mb-10 border border-amber-500/30 bg-amber-500/5 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle
            size={20}
            className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
          />
          <div>
            <h3 className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
              Static Demo vs Full Stack
            </h3>
            <p className="text-[var(--text-secondary)] text-sm mb-3">
              The{" "}
              <a
                href={LIVE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                GitHub Pages demo
              </a>{" "}
              runs as a static export with mock data. The{" "}
              <a
                href={AZURE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Azure EHDS Portal
              </a>{" "}
              runs the full stack with live services (reset nightly). The
              following features require the full stack:
            </p>
            <ul className="text-[var(--text-secondary)] text-sm space-y-1 ml-4 list-disc">
              <li>
                <strong>Keycloak SSO login</strong> — the static demo uses a
                persona switcher instead
              </li>
              <li>
                <strong>Live Neo4j graph queries</strong> — graph explorer uses
                pre-loaded mock data
              </li>
              <li>
                <strong>Contract negotiation &amp; transfers</strong> — require
                EDC connectors
              </li>
              <li>
                <strong>Natural language / federated queries</strong> — require
                neo4j-proxy service
              </li>
              <li>
                <strong>ODRL policy enforcement</strong> — requires live
                dataspace middleware
              </li>
            </ul>
            <p className="text-[var(--text-secondary)] text-xs mt-3">
              See the{" "}
              <Link
                href="/docs/developer"
                className="text-indigo-700 dark:text-indigo-400 underline"
              >
                Developer Guide
              </Link>{" "}
              for full stack setup instructions.
            </p>
          </div>
        </div>
      </div>

      {/* ── 0. Purpose ── */}
      <section className="mb-12" id="purpose">
        <h2 className="text-2xl font-semibold mb-3">Purpose</h2>
        <div className="border border-[var(--border)] rounded-xl p-5 bg-[var(--surface-2)]/20">
          <p className="text-[var(--text-secondary)] text-sm mb-3">
            This platform is a{" "}
            <strong className="text-[var(--text-primary)]">
              reference implementation of the European Health Data Space (EHDS)
              regulation
            </strong>
            . Its purpose is to demonstrate how sovereign health data exchange
            works in practice — combining the Dataspace Protocol (DSP 2025-1),
            FHIR R4 clinical resources, OMOP CDM analytics, and biomedical
            ontologies into a unified Neo4j knowledge graph.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              { label: "Synthetic patients", value: "127" },
              { label: "Graph nodes", value: "5,300+" },
              { label: "Architecture layers", value: "5" },
              { label: "Fictional organisations", value: "5" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border border-[var(--border)] rounded-lg p-3 text-center"
              >
                <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400">
                  {stat.value}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[var(--text-secondary)] text-sm mb-2">
            The five knowledge-graph layers model the complete EHDS data
            lifecycle:
          </p>
          <ol className="text-[var(--text-secondary)] text-sm space-y-1 ml-4 list-decimal">
            <li>
              <strong className="text-[var(--accent)]">
                L1 Dataspace Marketplace
              </strong>{" "}
              — Participants, DataProducts, ODRL policies, contracts, HDAB
              approvals
            </li>
            <li>
              <strong className="text-emerald-700 dark:text-teal-300">
                L2 HealthDCAT-AP Metadata
              </strong>{" "}
              — Catalogues, datasets, distributions, data services
            </li>
            <li>
              <strong className="text-green-700 dark:text-green-300">
                L3 FHIR R4 Clinical
              </strong>{" "}
              — Patients, encounters, conditions, observations, medications
            </li>
            <li>
              <strong className="text-orange-700 dark:text-orange-400">
                L4 OMOP CDM Analytics
              </strong>{" "}
              — Persons, condition occurrences, drug exposures, measurements
            </li>
            <li>
              <strong className="text-purple-700 dark:text-purple-400">
                L5 Biomedical Ontology
              </strong>{" "}
              — SNOMED CT, ICD-10, RxNorm, LOINC concept mappings
            </li>
          </ol>
          <p className="text-[var(--text-secondary)] text-xs mt-3">
            All data is fully synthetic. Organisation names are fictional
            (AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg
            Medical Centre, Institut de Recherche Sant&eacute;).
          </p>
        </div>
      </section>

      {/* ── 1. Personas & Roles ── */}
      <section className="mb-12" id="personas">
        <h2 className="text-2xl font-semibold mb-3">
          Personas &amp; Roles — Who Uses What?
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The EHDS regulation defines distinct participant roles to ensure
          accountability, data sovereignty, and patient rights across the health
          data ecosystem. This platform adapts its navigation, graph view, and
          available actions to the signed-in user&apos;s EHDS role. Sign in at{" "}
          <code className="text-xs bg-[var(--surface-2)] px-1 py-0.5 rounded">
            /auth/signin
          </code>{" "}
          with any demo account — password equals username in local dev.
        </p>

        <FeatureCard
          href="/auth/signin"
          title="Sign In — Demo Persona Cards"
          icon={Users}
        >
          <p className="text-[var(--text-secondary)] text-sm mb-3">
            The sign-in page lists every demo account with its role badge,
            organisation, and the graph persona view it will open after login.
            Clicking a card calls Keycloak SSO and redirects directly to the
            user&apos;s personalised graph.
          </p>

          {/* Demo users table with EHDS regulatory context */}
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th className="text-left py-1.5 pr-3">Username</th>
                  <th className="text-left py-1.5 pr-3">Organisation</th>
                  <th className="text-left py-1.5 pr-3">Role</th>
                  <th className="text-left py-1.5 pr-3">Graph view</th>
                  <th className="text-left py-1.5 pr-3">Primary question</th>
                  <th className="text-left py-1.5">EHDS basis</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    user: "edcadmin",
                    org: "Dataspace Operator",
                    role: "EDC Admin",
                    color: "text-[var(--danger-text)]",
                    graph: "edc-admin",
                    q: "Who are my participants? What contracts are active?",
                    ehds: "EHDS Art. 52 — operates the dataspace infrastructure and ensures interoperability between participants",
                  },
                  {
                    user: "clinicuser",
                    org: "AlphaKlinik Berlin",
                    role: "Data Holder",
                    color: "text-[var(--accent)]",
                    graph: "hospital",
                    q: "Who has approved access to my datasets?",
                    ehds: "EHDS Art. 33-34 — health data holders must make electronic health data available for secondary use when authorized",
                  },
                  {
                    user: "lmcuser",
                    org: "Limburg Medical Centre",
                    role: "Data Holder",
                    color: "text-[var(--accent)]",
                    graph: "hospital",
                    q: "What contracts are active for my NL datasets?",
                    ehds: "EHDS Art. 33-34 — cross-border data holder demonstrating multi-country interoperability",
                  },
                  {
                    user: "researcher",
                    org: "PharmaCo Research AG",
                    role: "Researcher",
                    color: "text-[var(--success-text)]",
                    graph: "researcher",
                    q: "What datasets match my study protocol?",
                    ehds: "EHDS Art. 34(1) — data users access health data for permitted secondary use purposes (research, innovation, public health)",
                  },
                  {
                    user: "regulator",
                    org: "MedReg DE",
                    role: "HDAB Authority",
                    color: "text-amber-700 dark:text-amber-400",
                    graph: "hdab",
                    q: "What approvals are pending? Is the chain complete?",
                    ehds: "EHDS Art. 36-37 — Health Data Access Bodies are designated by each Member State to authorize secondary use of health data",
                  },
                ].map((p) => (
                  <tr key={p.user} className="border-b border-[var(--border)]">
                    <td className="py-1.5 pr-3 font-mono font-semibold text-[var(--text-primary)]">
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
                    <td className="py-1.5 pr-3 text-[var(--text-secondary)] italic">
                      {p.q}
                    </td>
                    <td className="py-1.5 text-[var(--text-secondary)]">
                      {p.ehds}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FeatureCard>

        {/* EHDS role background */}
        <div className="mt-6 border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 mb-3">
            Why These Roles? — EHDS Regulatory Background
          </h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            The European Health Data Space regulation establishes a governance
            framework for both primary use (patient access to their own data)
            and secondary use (research, innovation, policy-making). Each role
            in this platform maps to a specific actor defined in the regulation:
          </p>
          <div className="space-y-3">
            {[
              {
                role: "Data Holder",
                color: "text-[var(--accent)]",
                article: "Art. 33-34",
                why: "Healthcare providers, insurers, and registries that hold electronic health data are legally required to make it available for authorized secondary use. They retain sovereignty over their data and control access through ODRL policies and contract negotiation.",
              },
              {
                role: "Data User (Researcher)",
                color: "text-[var(--success-text)]",
                article: "Art. 34(1), Art. 45-46",
                why: "Researchers, public health agencies, and innovators who need health data for permitted purposes must apply through an HDAB, receive a data permit, and access data only in a secure processing environment. They never receive raw patient data directly.",
              },
              {
                role: "HDAB Authority",
                color: "text-amber-700 dark:text-amber-400",
                article: "Art. 36-37",
                why: "Each EU Member State must designate one or more Health Data Access Bodies (HDABs) as the national authority that reviews data access applications, issues data permits, and ensures compliance. MedReg DE represents the German HDAB in this implementation.",
              },
              {
                role: "EDC Admin / Dataspace Operator",
                color: "text-[var(--danger-text)]",
                article: "Art. 52",
                why: "The dataspace operator runs the technical infrastructure: participant onboarding, connector management, federated catalog, and transfer monitoring. They ensure interoperability across all participants but do not access health data directly.",
              },
              {
                role: "Trust Center Operator",
                color: "text-violet-700 dark:text-violet-400",
                article: "Art. 50(1)(e)",
                why: "The EHDS mandates pseudonymisation and re-identification controls. The Trust Center manages pseudonym resolution, secure processing environment (SPE) sessions, and ensures that data users only access de-identified data. This role enforces the technical privacy safeguards the regulation requires.",
              },
            ].map((r) => (
              <div
                key={r.role}
                className="border border-[var(--border)] rounded-lg p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-semibold text-sm ${r.color}`}>
                    {r.role}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                    {r.article}
                  </span>
                </div>
                <p className="text-[var(--text-secondary)] text-xs">{r.why}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Menu items per role */}
        <div className="mt-6 border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 mb-3">
            Menu Items per Role
          </h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            Navigation is filtered by role — items not relevant to a user&apos;s
            function are hidden entirely. This separation of concerns reflects
            the EHDS principle that each actor should only see the tools and
            data relevant to their regulatory function.
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th className="text-left py-1.5 pr-2">Route</th>
                  <th className="text-center py-1.5 px-2">Public</th>
                  <th className="text-center py-1.5 px-2">
                    <span className="text-[var(--accent)]">Data Holder</span>
                  </th>
                  <th className="text-center py-1.5 px-2">
                    <span className="text-[var(--success-text)]">
                      Researcher
                    </span>
                  </th>
                  <th className="text-center py-1.5 px-2">
                    <span className="text-amber-700 dark:text-amber-400">
                      HDAB
                    </span>
                  </th>
                  <th className="text-center py-1.5 px-2">
                    <span className="text-[var(--danger-text)]">EDC Admin</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["/graph", "\u2705", "\u2705", "\u2705", "\u2705", "\u2705"],
                  [
                    "/catalog",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                  ],
                  [
                    "/catalog/editor",
                    "\u2014",
                    "\u2705",
                    "\u2014",
                    "\u2014",
                    "\u2705",
                  ],
                  [
                    "/patient",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                  ],
                  [
                    "/analytics",
                    "\u2014",
                    "\u2014",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                  ],
                  [
                    "/query (NLQ)",
                    "\u2014",
                    "\u2014",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                  ],
                  ["/eehrxf", "\u2705", "\u2705", "\u2705", "\u2705", "\u2705"],
                  [
                    "/compliance",
                    "\u2014",
                    "\u2014",
                    "\u2014",
                    "\u2705",
                    "\u2705",
                  ],
                  [
                    "/data/share",
                    "\u2014",
                    "\u2705",
                    "\u2014",
                    "\u2014",
                    "\u2705",
                  ],
                  [
                    "/data/discover",
                    "\u2014",
                    "\u2014",
                    "\u2705",
                    "\u2705",
                    "\u2705",
                  ],
                  [
                    "/negotiate",
                    "\u2014",
                    "\u2705",
                    "\u2705",
                    "\u2014",
                    "\u2705",
                  ],
                  [
                    "/admin + /admin/*",
                    "\u2014",
                    "\u2014",
                    "\u2014",
                    "\u2014",
                    "\u2705",
                  ],
                  [
                    "/admin/policies + audit",
                    "\u2014",
                    "\u2014",
                    "\u2014",
                    "\u2705",
                    "\u2705",
                  ],
                  ["/docs", "\u2705", "\u2705", "\u2705", "\u2705", "\u2705"],
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
                          v === "\u2705"
                            ? "text-[var(--success-text)]"
                            : "text-[var(--text-secondary)]"
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
          <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 mb-3">
            Graph Explorer — Persona Views
          </h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            The <strong>&ldquo;View as&rdquo;</strong> panel in the graph
            sidebar and the <strong>&ldquo;My graph view&rdquo;</strong> link in
            the UserMenu dropdown load a role-specific subgraph that answers
            each persona&apos;s primary question. Each view surfaces only the
            graph layers and node types relevant to that regulatory function.
          </p>
          <div className="space-y-3">
            {[
              {
                param: "?persona=hospital",
                label: "Hospital / Data Holder",
                color: "text-[var(--accent)]",
                q: "Who has approved access to my datasets?",
                nodes:
                  "Participant \u00b7 HealthDataset \u00b7 Contract \u00b7 HDABApproval \u00b7 EEHRxFProfile",
              },
              {
                param: "?persona=researcher",
                label: "Researcher / Data User",
                color: "text-[var(--success-text)]",
                q: "What datasets match my study? What OMOP analytics can I run?",
                nodes:
                  "HealthDataset \u00b7 OMOPPerson \u00b7 SnomedConcept \u00b7 SPESession",
              },
              {
                param: "?persona=hdab",
                label: "HDAB Authority",
                color: "text-amber-700 dark:text-amber-400",
                q: "What approvals are pending? Is the governance chain complete?",
                nodes:
                  "HDABApproval \u00b7 VerifiableCredential \u00b7 TrustCenter \u00b7 AccessApplication",
              },
              {
                param: "?persona=trust-center",
                label: "Trust Center Operator",
                color: "text-violet-700 dark:text-violet-400",
                q: "Which pseudonym resolution flows am I managing?",
                nodes:
                  "TrustCenter \u00b7 SPESession \u00b7 ResearchPseudonym \u00b7 ProviderPseudonym",
              },
              {
                param: "?persona=edc-admin",
                label: "EDC Admin",
                color: "text-[var(--danger-text)]",
                q: "Who are my participants? What contracts and transfers are live?",
                nodes:
                  "Participant \u00b7 DataProduct \u00b7 Contract \u00b7 TransferEvent",
              },
            ].map((p) => (
              <div
                key={p.param}
                className="border border-[var(--border)] rounded-lg p-3 hover:border-indigo-500/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${p.color}`}>
                      {p.label}
                    </span>
                    <code className="text-xs text-[var(--text-secondary)] font-mono">
                      /graph{p.param}
                    </code>
                  </div>
                  <a
                    href={`/graph${p.param}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
                  >
                    Try it <ExternalLink size={12} />
                  </a>
                </div>
                <p className="text-[var(--text-secondary)] text-xs italic mb-1">
                  &ldquo;{p.q}&rdquo;
                </p>
                <p className="text-[var(--text-secondary)] text-xs">
                  Focus nodes: {p.nodes}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. Getting Started ── */}
      <section className="mb-12" id="getting-started">
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
          <FeatureCard href="/" title="Home Dashboard" icon={LayoutDashboard}>
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
          </FeatureCard>

          <FeatureCard
            href="/onboarding"
            title="Participant Onboarding"
            icon={UserPlus}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              The onboarding wizard guides new participants through dataspace
              registration: creating a DID identity, registering with the
              Credential Federated Manager, and enrolling in the federated
              catalog. This process implements the EHDS requirement for
              authorised participation (Art. 52) with verifiable credentials.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: Limburg Medical Centre joins the EHDS dataspace by
              providing its organization details, generating{" "}
              <code className="text-xs">did:web:lmc.nl:clinic</code>, and
              obtaining a MembershipCredential.
            </p>
          </FeatureCard>

          <FeatureCard
            href="/settings"
            title="Participant Settings"
            icon={Settings}
            requiresJAD
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
          </FeatureCard>
        </div>
      </section>

      {/* ── 3. Explore ── */}
      <section className="mb-12" id="explore">
        <h2 className="text-2xl font-semibold mb-4">Explore</h2>
        <div className="space-y-6">
          <FeatureCard href="/graph" title="Graph Explorer" icon={Globe}>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              The force-directed graph visualisation displays all five
              architecture layers of the knowledge graph. Nodes are colour-coded
              by layer:{" "}
              <span className="text-[var(--accent)]">Marketplace</span>,{" "}
              <span className="text-emerald-700 dark:text-teal-300">
                HealthDCAT-AP
              </span>
              ,{" "}
              <span className="text-green-700 dark:text-green-300">
                FHIR R4
              </span>
              ,{" "}
              <span className="text-orange-700 dark:text-orange-400">
                OMOP CDM
              </span>
              , and <span className="text-[var(--accent)]">Ontology</span>. This
              unified view shows how the EHDS connects clinical data (FHIR),
              analytics (OMOP), and governance (DSP) into a coherent ecosystem.
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
          </FeatureCard>

          <FeatureCard href="/catalog" title="Dataset Catalog" icon={Database}>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Browse and search HealthDCAT-AP metadata records for all published
              datasets. Each entry shows title, description, publisher,
              temporal/spatial coverage, and distribution formats. The catalog
              implements the EHDS metadata requirements (Art. 55) for
              discoverable, machine-readable dataset descriptions.
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
          </FeatureCard>

          <FeatureCard href="/patient" title="Patient Journey" icon={Search}>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              View the clinical timeline for synthetic patients, showing FHIR R4
              resources (Encounters, Conditions, Observations, Medications,
              Procedures) mapped to their OMOP CDM equivalents. This dual-view
              demonstrates how primary-use clinical data (EHDS Art. 3-12) can be
              transformed for secondary-use analytics while preserving semantic
              integrity.
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
          </FeatureCard>

          <FeatureCard
            href="/analytics"
            title="OMOP Analytics"
            icon={BarChart3}
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Cohort-level research analytics powered by the OMOP CDM layer. Run
              aggregate queries across conditions, measurements, drug exposures,
              and procedures. This implements the EHDS secondary-use analytics
              capability (Art. 34) where researchers work with de-identified,
              standardised data.
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
          </FeatureCard>

          <FeatureCard
            href="/query"
            title="Natural Language / Federated Query"
            icon={MessageSquare}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Execute cross-participant queries using natural language or
              structured query syntax. The query engine translates requests into
              federated SPARQL/Cypher queries across connected dataspace nodes.
              This demonstrates how the EHDS enables cross-border data access
              without centralising raw health data.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: A researcher types &quot;How many patients with
              hypertension are older than 65?&quot; and the system queries both
              AlphaKlinik Berlin and Limburg Medical Centre, returning
              aggregated results without moving raw data.
            </p>
          </FeatureCard>

          <FeatureCard href="/eehrxf" title="EEHRxF Profiles" icon={FileCheck}>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              European EHR Exchange Format profile alignment view. Analyse which
              FHIR profiles satisfy EHDS priority categories (Patient Summary,
              ePrescription, Laboratory Results, Medical Imaging, Hospital
              Discharge) and identify coverage gaps. The EEHRxF is mandated by
              EHDS Art. 6 to ensure interoperability of primary-use health data
              across Member States.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: MedReg DE reviews AlphaKlinik Berlin&apos;s profile
              coverage and sees that Patient Summary and Laboratory Results are
              fully aligned, while ePrescription has one missing profile.
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── 4. Governance ── */}
      <section className="mb-12" id="governance">
        <h2 className="text-2xl font-semibold mb-3">Governance</h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The governance modules manage EHDS compliance, protocol testing, and
          verifiable credential issuance as required by the European Health Data
          Space regulation (Articles 36-52). These modules ensure that every
          data access follows the legally mandated approval chain: application,
          HDAB review, data permit issuance, contract negotiation, and audited
          transfer.
        </p>
        <MermaidDiagram
          chart={complianceDiagram}
          caption="EHDS data access compliance workflow"
        />

        <div className="space-y-6 mt-6">
          <FeatureCard
            href="/compliance"
            title="EHDS Approval"
            icon={Award}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Manage data access permits as required by EHDS Articles 45-49.
              Data users submit applications specifying the purpose, scope, and
              duration of data access. HDABs review applications against the
              permitted purposes in Art. 34(1) and issue verifiable credentials
              as proof of authorization.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG submits a data access application
              for the diabetes cohort. MedReg DE (HDAB) reviews the request,
              approves it under Art. 46, and a DataPermitCredential is issued.
            </p>
          </FeatureCard>

          <FeatureCard
            href="/compliance/tck"
            title="Protocol TCK"
            icon={TestTube}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              The Technology Compatibility Kit validates that your EDC connector
              implements the Dataspace Protocol (DSP 2025-1) correctly. Tests
              cover catalog queries, contract negotiations, and transfer
              processes. Passing the TCK is a prerequisite for interoperability
              within the EHDS ecosystem.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: The operator runs the TCK suite and confirms 20/20 tests
              passing — verifying DSP-compliant catalog, negotiation, and
              transfer process implementations.
            </p>
          </FeatureCard>

          <FeatureCard
            href="/credentials"
            title="Verifiable Credentials"
            icon={Shield}
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              View and manage verifiable credentials across all dataspace
              participants. Each participant holds a MembershipCredential and an
              EHDSParticipantCredential, issued by the trusted issuer service.
              Credentials follow the DCP v1.0 standard for decentralised claims,
              enabling trust without a central authority.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: The operator verifies that all 5 participants
              (AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg
              Medical Centre, Institut de Recherche Sant&eacute;) each hold 2
              active credentials.
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── 5. Data Exchange ── */}
      <section className="mb-12" id="data-exchange">
        <h2 className="text-2xl font-semibold mb-3">Data Exchange</h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The sovereign data exchange pipeline follows the Dataspace Protocol
          (DSP 2025-1): share assets, discover via federated catalog, negotiate
          contracts, manage tasks, and transfer data. This pipeline implements
          EHDS Art. 33-34 requirements for making health data available while
          preserving data holder sovereignty through policy-controlled access.
        </p>

        <div className="space-y-6">
          <FeatureCard
            href="/data/share"
            title="Share Data"
            icon={Share2}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Publish datasets with HealthDCAT-AP metadata and ODRL access
              policies for the federated catalog. Define distribution endpoints,
              data quality attributes, and usage constraints. Data holders use
              this page to fulfil their obligation under EHDS Art. 33 to make
              data available for secondary use.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: AlphaKlinik Berlin publishes a &quot;Synthetic Diabetes
              Cohort&quot; dataset with FHIR R4 bulk export distribution, EHDS
              Art. 33 usage policy, and spatial coverage set to DE.
            </p>
          </FeatureCard>

          <FeatureCard
            href="/data/discover"
            title="Discover"
            icon={Compass}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Search the federated catalog across all connected dataspace
              participants. Results aggregate datasets from multiple EDC
              connectors, showing availability and access terms. The federated
              catalog enables cross-border dataset discovery without
              centralising metadata.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG discovers 3 datasets across 2
              participants for &quot;cardiovascular&quot; research — one from
              AlphaKlinik Berlin and two from Limburg Medical Centre.
            </p>
          </FeatureCard>

          <FeatureCard
            href="/negotiate"
            title="Negotiate"
            icon={Handshake}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Initiate and track DSP contract negotiations with data holders.
              View negotiation state (REQUESTED, AGREED, VERIFIED, FINALIZED),
              ODRL policy terms, and counter-offer history. Contract negotiation
              ensures that data access terms are mutually agreed before any
              transfer occurs, as required by EHDS Art. 34.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG initiates a contract negotiation
              with AlphaKlinik Berlin for the diabetes cohort. The negotiation
              progresses to FINALIZED with an EHDS Art. 33(c) research use
              policy.
            </p>
          </FeatureCard>

          <FeatureCard
            href="/tasks"
            title="Tasks"
            icon={ClipboardList}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Monitor the task queue for pending and active data transfer
              operations. Tasks track the full lifecycle from initiation through
              provisioning to completion, providing the audit trail required by
              EHDS for accountability.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: The operator monitors a bulk FHIR export task from
              AlphaKlinik Berlin to PharmaCo Research AG — currently at the
              provisioning stage with an estimated 2-minute completion time.
            </p>
          </FeatureCard>

          <FeatureCard
            href="/data/transfer"
            title="Transfer"
            icon={ArrowLeftRight}
            requiresJAD
          >
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              View the complete history of data transfers — both initiated and
              received. Each entry includes timestamps, transfer size, protocol
              used, and a link to the audit trail. Transfer logging implements
              the EHDS requirement for full traceability of all health data
              movements across the dataspace.
            </p>
            <p className="text-[var(--text-secondary)] text-xs italic">
              Example: PharmaCo Research AG reviews its transfer history showing
              a completed 12 MB FHIR bulk export from AlphaKlinik Berlin,
              transferred via HTTP-PUSH with full W3C PROV audit trail.
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── 6. Administration ── */}
      <section className="mb-12" id="admin">
        <h2 className="text-2xl font-semibold mb-3">Administration</h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          Platform administrators manage participants, access policies, and
          audit logs. The admin dashboard provides an overview of system health,
          active connections, and recent activity. Access requires the EDC_ADMIN
          role assigned through Keycloak. The operator role is defined by EHDS
          Art. 52 as responsible for ensuring the technical infrastructure
          supports interoperable, sovereign data exchange.
        </p>

        <div className="space-y-6">
          <FeatureCard
            href="/admin"
            title="Operator Dashboard"
            icon={LayoutDashboard}
            requiresJAD
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
          </FeatureCard>

          <FeatureCard
            href="/admin/components"
            title="EDC Components"
            icon={Cpu}
            requiresJAD
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
          </FeatureCard>
        </div>
      </section>

      {/* ── Help ── */}
      <section
        className="bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl p-6"
        id="help"
      >
        <h2 className="font-semibold mb-2">Need Help?</h2>
        <p className="text-[var(--text-secondary)] text-sm mb-2">
          For technical questions, see the{" "}
          <Link
            href="/docs/developer"
            className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
          >
            Developer Guide
          </Link>
          . For architecture details, visit the{" "}
          <Link
            href="/docs/architecture"
            className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
          >
            Architecture Diagrams
          </Link>
          . Try the live demo at{" "}
          <a
            href={LIVE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
          >
            GitHub Pages
          </a>
          .
        </p>
        <p className="text-[var(--text-secondary)] text-sm">
          For the complete end-to-end walkthrough of every persona and workflow,
          read the{" "}
          <a
            href={FULL_JOURNEY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
          >
            Full User Journey
            <ExternalLink size={12} />
          </a>
          .
        </p>
      </section>
    </div>
  );
}
