"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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

export default function UserGuidePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-6"
      >
        <ArrowLeft size={14} /> Back to Docs
      </Link>
      <h1 className="text-3xl font-bold mb-2">User Guide</h1>
      <p className="text-gray-400 mb-8">
        A practical guide for business users, researchers, and data stewards
        working with the Health Dataspace platform.
      </p>

      {/* Workflow overview */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Getting Started</h2>
        <MermaidDiagram
          chart={userWorkflowDiagram}
          caption="User workflow overview"
        />
        <p className="text-gray-400 text-sm mt-3">
          After authenticating through Keycloak SSO, you can explore the
          knowledge graph, browse datasets, review patient timelines, run
          analytics, or check EHDS compliance status.
        </p>
      </section>

      {/* Views section */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Application Views</h2>

        <div className="space-y-6">
          <div className="border border-gray-700 rounded-xl p-5">
            <h3
              className="text-lg font-semibold text-indigo-400 mb-2"
              id="graph-explorer"
            >
              Graph Explorer
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              The force-directed graph visualisation displays all five
              architecture layers of the knowledge graph. Nodes are colour-coded
              by layer: <span className="text-blue-400">Marketplace</span>,
              <span className="text-green-400"> HealthDCAT-AP</span>,
              <span className="text-yellow-400"> FHIR R4</span>,
              <span className="text-orange-400"> OMOP CDM</span>, and
              <span className="text-purple-400"> Ontology</span>.
            </p>
            <ul className="text-gray-400 text-sm space-y-1 ml-4 list-disc">
              <li>Click nodes to see properties and related entities</li>
              <li>Use the layer toggle to filter visible layers</li>
              <li>Zoom and pan with mouse controls</li>
              <li>Search bar finds specific nodes across all layers</li>
            </ul>
          </div>

          <div className="border border-gray-700 rounded-xl p-5">
            <h3
              className="text-lg font-semibold text-indigo-400 mb-2"
              id="dataset-catalog"
            >
              Dataset Catalog
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              Browse and search HealthDCAT-AP metadata records for all published
              datasets in the dataspace. Each entry shows title, description,
              publisher, temporal/spatial coverage, and distribution formats.
            </p>
            <ul className="text-gray-400 text-sm space-y-1 ml-4 list-disc">
              <li>Filter by publisher, theme, or keyword</li>
              <li>View distribution endpoints (FHIR, OMOP, bulk export)</li>
              <li>Check data quality metrics (DQV dimensions)</li>
              <li>
                Initiate data access requests directly from catalog entries
              </li>
            </ul>
          </div>

          <div className="border border-gray-700 rounded-xl p-5">
            <h3
              className="text-lg font-semibold text-indigo-400 mb-2"
              id="patient-journey"
            >
              Patient Journey
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              View the clinical timeline for synthetic patients, showing FHIR R4
              resources (Encounters, Conditions, Observations, Medications,
              Procedures) mapped to their OMOP CDM equivalents.
            </p>
            <ul className="text-gray-400 text-sm space-y-1 ml-4 list-disc">
              <li>Select patients from the patient list</li>
              <li>Timeline displays events chronologically</li>
              <li>Toggle between FHIR and OMOP views</li>
              <li>Explore SNOMED/LOINC/RxNorm concept mappings</li>
            </ul>
          </div>

          <div className="border border-gray-700 rounded-xl p-5">
            <h3
              className="text-lg font-semibold text-indigo-400 mb-2"
              id="analytics"
            >
              OMOP Analytics
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              Cohort-level research analytics powered by the OMOP CDM layer. Run
              aggregate queries across conditions, measurements, drug exposures,
              and procedures.
            </p>
            <ul className="text-gray-400 text-sm space-y-1 ml-4 list-disc">
              <li>View condition prevalence and demographics</li>
              <li>Analyse drug exposure patterns</li>
              <li>Run cohort characterisation queries</li>
              <li>Export results for further analysis</li>
            </ul>
          </div>

          <div className="border border-gray-700 rounded-xl p-5">
            <h3
              className="text-lg font-semibold text-indigo-400 mb-2"
              id="eehrxf-profiles"
            >
              EEHRxF Profiles
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              European EHR Exchange Format profile alignment view. Analyse which
              FHIR profiles satisfy EHDS priority categories and identify
              coverage gaps.
            </p>
            <ul className="text-gray-400 text-sm space-y-1 ml-4 list-disc">
              <li>Review profile-to-priority category mapping</li>
              <li>Identify gaps in EHDS coverage</li>
              <li>View profile details and conformance rules</li>
              <li>Compare alignment across data holders</li>
            </ul>
          </div>
        </div>
      </section>

      {/* EHDS Compliance */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="compliance">
          EHDS Compliance Workflow
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          The compliance portal manages data access permits as required by the
          European Health Data Space regulation (Articles 45–52). Data users
          must obtain HDAB approval before accessing health data through the
          dataspace.
        </p>
        <MermaidDiagram
          chart={complianceDiagram}
          caption="EHDS data access compliance workflow"
        />
      </section>

      {/* Data Exchange */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="data-exchange">
          Data Exchange Portal
        </h2>
        <p className="text-gray-400 text-sm mb-3">
          The portal provides four key functions for sovereign data exchange:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Share Data</h4>
            <p className="text-gray-500 text-xs">
              Publish datasets with HealthDCAT-AP metadata and access policies
              for the federated catalog.
            </p>
          </div>
          <div className="border border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Discover</h4>
            <p className="text-gray-500 text-xs">
              Search the federated catalog across all connected dataspace
              participants.
            </p>
          </div>
          <div className="border border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Negotiate</h4>
            <p className="text-gray-500 text-xs">
              Initiate and track DSP contract negotiations with data holders.
            </p>
          </div>
          <div className="border border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Transfer</h4>
            <p className="text-gray-500 text-xs">
              Monitor active data transfers and download received datasets.
            </p>
          </div>
        </div>
      </section>

      {/* Admin */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="admin">
          Administration
        </h2>
        <p className="text-gray-400 text-sm">
          Platform administrators can manage tenants, access policies, and audit
          logs through the Admin section. The dashboard provides an overview of
          system health, active connections, and recent activity. Access
          requires the admin role assigned through Keycloak.
        </p>
      </section>

      {/* Help */}
      <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h2 className="font-semibold mb-2">Need Help?</h2>
        <p className="text-gray-400 text-sm">
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
          .
        </p>
      </section>
    </div>
  );
}
