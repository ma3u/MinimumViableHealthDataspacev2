"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Database,
  Network,
  Loader2,
  Edit3,
  Download,
  GitBranch,
  X,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import MermaidDiagram from "@/components/MermaidDiagram";

interface Dataset {
  id: string;
  title: string;
  description: string;
  license: string;
  conformsTo: string;
  publisher: string;
  theme: string;
  datasetType: string;
  legalBasis: string;
  recordCount: number;
  providers?: string[];
  consumers?: string[];
  fhirResources?: string[];
  transfers?: string[];
}

const LEGAL_BASIS_LABELS: Record<string, string> = {
  "EHDS-Art53-SecondaryUse": "EHDS Art. 53",
};

/** Generate a Mermaid ER diagram for a HealthDCAT-AP dataset entry. */
function buildDcatApDiagram(d: Dataset): string {
  const lines = [
    "erDiagram",
    `    HealthDataset {`,
    `        string id "${d.id}"`,
    `        string title "${d.title}"`,
    `        string publisher "${d.publisher || "—"}"`,
    `        string theme "${d.theme || "—"}"`,
    `        string license "${d.license || "—"}"`,
    `        string legalBasis "${d.legalBasis || "—"}"`,
    `        string conformsTo "${d.conformsTo || "—"}"`,
    `        string datasetType "${d.datasetType || "—"}"`,
    `        int recordCount "${d.recordCount ?? "—"}"`,
    `    }`,
  ];
  if (d.publisher) {
    lines.push(
      `    Publisher {`,
      `        string name "${d.publisher}"`,
      `    }`,
    );
    lines.push(`    Publisher ||--o{ HealthDataset : "publishes"`);
  }
  if (d.conformsTo?.includes("fhir")) {
    lines.push(
      `    FHIRProfile {`,
      `        string version "R4"`,
      `        string spec "${d.conformsTo}"`,
      `    }`,
    );
    lines.push(`    HealthDataset ||--|| FHIRProfile : "conformsTo"`);
  }
  if (d.legalBasis) {
    lines.push(
      `    LegalBasis {`,
      `        string article "${d.legalBasis}"`,
      `    }`,
    );
    lines.push(`    HealthDataset ||--|| LegalBasis : "legalBasisForAccess"`);
  }
  if (d.theme) {
    lines.push(`    Theme {`, `        string label "${d.theme}"`, `    }`);
    lines.push(`    HealthDataset }o--|| Theme : "theme"`);
  }
  lines.push(
    `    Catalog {`,
    `        string standard "HealthDCAT-AP"`,
    `    }`,
  );
  lines.push(`    Catalog ||--o{ HealthDataset : "dcatDataset"`);
  return lines.join("\n");
}

/** Build a JSON-LD representation of a dataset following HealthDCAT-AP / DCAT 3. */
function buildDcatApJsonLd(d: Dataset): object {
  return {
    "@context": {
      dcat: "http://www.w3.org/ns/dcat#",
      dct: "http://purl.org/dc/terms/",
      healthdcatap: "https://healthdcat-ap.github.io/ns#",
      foaf: "http://xmlns.com/foaf/0.1/",
    },
    "@type": "dcat:Dataset",
    "@id": d.id,
    "dct:title": d.title,
    "dct:description": d.description,
    "dct:license": d.license,
    "dct:conformsTo": d.conformsTo,
    "dct:publisher": d.publisher
      ? { "@type": "foaf:Organization", "foaf:name": d.publisher }
      : undefined,
    "dcat:theme": d.theme,
    "healthdcatap:datasetType": d.datasetType,
    "healthdcatap:legalBasisForAccess": d.legalBasis,
    "healthdcatap:numberOfRecords": d.recordCount,
  };
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-xs text-[var(--text-secondary)] w-36 shrink-0">
        {label}
      </span>
      <span className="text-xs text-[var(--text-primary)] break-all">
        {String(value)}
      </span>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-[var(--text-secondary)] p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}

function CatalogContent() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("search") ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [diagramDataset, setDiagramDataset] = useState<Dataset | null>(null);

  const downloadDcatAp = (d: Dataset) => {
    const jsonLd = buildDcatApJsonLd(d);
    const blob = new Blob([JSON.stringify(jsonLd, null, 2)], {
      type: "application/ld+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${d.id.replace(/[^a-z0-9-]/gi, "_")}.jsonld`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchApi("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d) ? d : d.datasets || d.catalog || [];
        if (arr.length > 0) {
          setDatasets(arr);
          setLoading(false);
        } else {
          throw new Error("empty");
        }
      })
      .catch(() => {
        // Fallback: load mock catalog directly
        fetch("/mock/catalog.json")
          .then((r) => r.json())
          .then((d) => setDatasets(Array.isArray(d) ? d : []))
          .catch(() => {
            /* exhausted */
          })
          .finally(() => setLoading(false));
      });
  }, []);

  const visible = datasets.filter(
    (d) =>
      !filter ||
      d.title?.toLowerCase().includes(filter.toLowerCase()) ||
      d.description?.toLowerCase().includes(filter.toLowerCase()) ||
      d.theme?.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <PageIntro
          title="Dataset Catalog"
          icon={Database}
          description="Browse HealthDCAT-AP metadata for all EHDS secondary-use datasets registered in the dataspace. Each entry describes the data holder, legal basis, FHIR profiles, and access conditions."
          prevStep={{ href: "/graph", label: "Graph Explorer" }}
          nextStep={{ href: "/data/discover", label: "Discover Data" }}
          infoText="Datasets are registered using the HealthDCAT-AP standard (DCAT 3 profile for health data). Use the search to filter by title, theme, or description before requesting access."
          docLink={{
            href: "https://healthdcat-ap.github.io/",
            label: "HealthDCAT-AP Specification",
            external: true,
          }}
        />

        <input
          type="search"
          placeholder="Filter by title, description or theme…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full mb-6 px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm outline-none focus:border-layer2"
        />

        {loading ? (
          <p className="text-[var(--text-secondary)]">Connecting to Neo4j…</p>
        ) : visible.length === 0 ? (
          <p className="text-[var(--text-secondary)]">No datasets found.</p>
        ) : (
          <div className="grid gap-4">
            {visible.map((d, idx) => {
              const isOpen = expanded === d.id;
              return (
                <div
                  key={d.id ?? `dataset-${idx}`}
                  className={`border rounded-xl transition-colors ${
                    isOpen
                      ? "border-layer2 bg-[var(--surface)]/60"
                      : "border-[var(--border)] hover:border-layer2"
                  }`}
                >
                  {/* Card header — click to expand */}
                  <button
                    className="w-full text-left p-4"
                    onClick={() => setExpanded(isOpen ? null : d.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="font-semibold text-[var(--text-primary)]">
                          {d.title ?? d.id}
                        </h2>
                        {d.description && (
                          <p className="text-sm text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                            {d.description}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {d.datasetType && (
                          <span className="text-xs bg-[var(--layer2-text)]/10 text-[var(--layer2-text)] px-2 py-0.5 rounded-full font-medium">
                            {d.datasetType}
                          </span>
                        )}
                        {d.theme && (
                          <span className="text-xs bg-[var(--surface-2)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                            {d.theme}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 text-[var(--text-secondary)] mt-0.5">
                        {isOpen ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </div>
                    </div>

                    {/* Summary row */}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
                      {d.publisher && <span>Publisher: {d.publisher}</span>}
                      {d.legalBasis && (
                        <span className="text-[var(--success-text)]">
                          Legal basis:{" "}
                          {LEGAL_BASIS_LABELS[d.legalBasis] ?? d.legalBasis}
                        </span>
                      )}
                      {d.recordCount != null && (
                        <span>
                          {Number(d.recordCount).toLocaleString()} records
                        </span>
                      )}
                      {d.license && <span>License: {d.license}</span>}
                    </div>

                    {/* Provider / Consumer / FHIR badges */}
                    {((d.providers && d.providers.length > 0) ||
                      (d.consumers && d.consumers.length > 0) ||
                      (d.fhirResources && d.fhirResources.length > 0)) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {d.providers && d.providers.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[var(--role-holder-text)] font-medium">
                              Providers:
                            </span>
                            {d.providers.map((p) => (
                              <span
                                key={p}
                                className="bg-[var(--role-holder-bg)] text-[var(--role-holder-text)] px-1.5 py-0.5 rounded border border-[var(--role-holder-border)]"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                        {d.consumers && d.consumers.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[var(--role-hdab-text)] font-medium">
                              Consumers:
                            </span>
                            {d.consumers.map((c) => (
                              <span
                                key={c}
                                className="bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] px-1.5 py-0.5 rounded border border-[var(--role-hdab-border)]"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                        {d.fhirResources && d.fhirResources.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[var(--role-user-text)] font-medium">
                              FHIR:
                            </span>
                            <span className="bg-[var(--role-user-bg)] text-[var(--role-user-text)] px-1.5 py-0.5 rounded border border-[var(--role-user-border)]">
                              {d.fhirResources.length} Patient
                              {d.fhirResources.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </button>

                  {/* Expanded detail panel */}
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-[var(--border)] mt-1 pt-3">
                      <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                        HealthDCAT-AP Metadata
                      </h3>
                      <div className="bg-[var(--surface-2)]/50 rounded-lg px-3 py-1">
                        <DetailRow label="Dataset ID" value={d.id} />
                        <DetailRow label="Title" value={d.title} />
                        <DetailRow label="Description" value={d.description} />
                        <DetailRow label="Publisher" value={d.publisher} />
                        <DetailRow
                          label="Data Providers"
                          value={
                            d.providers?.length ? d.providers.join(", ") : null
                          }
                        />
                        <DetailRow
                          label="Data Consumers"
                          value={
                            d.consumers?.length ? d.consumers.join(", ") : null
                          }
                        />
                        <DetailRow
                          label="FHIR Patients"
                          value={
                            d.fhirResources?.length
                              ? `${
                                  d.fhirResources.length
                                } linked (${d.fhirResources.join(", ")})`
                              : null
                          }
                        />
                        <DetailRow
                          label="Data Transfers"
                          value={
                            d.transfers?.length ? d.transfers.join(", ") : null
                          }
                        />
                        <DetailRow label="Dataset Type" value={d.datasetType} />
                        <DetailRow
                          label="Legal Basis"
                          value={
                            LEGAL_BASIS_LABELS[d.legalBasis] ?? d.legalBasis
                          }
                        />
                        <DetailRow
                          label="Record Count"
                          value={
                            d.recordCount != null
                              ? Number(d.recordCount).toLocaleString()
                              : null
                          }
                        />
                        <DetailRow label="Theme" value={d.theme} />
                        <DetailRow label="License" value={d.license} />
                        <DetailRow label="Conforms To" value={d.conformsTo} />
                      </div>
                      <div className="flex flex-wrap gap-3 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDiagramDataset(d);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-purple-400 hover:underline"
                        >
                          <GitBranch size={11} />
                          Show Data Model
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadDcatAp(d);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
                        >
                          <Download size={11} />
                          Download DCAT-AP
                        </button>
                        <a
                          href={`/graph?highlight=${encodeURIComponent(
                            d.title || d.id,
                          )}`}
                          className="inline-flex items-center gap-1 text-xs text-layer2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Network size={11} />
                          View in Graph
                        </a>
                        <a
                          href="https://ehds.healthdataportal.eu/editor2/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Edit3 size={11} />
                          Open in EHDS DCAT-AP Editor
                        </a>
                        <a
                          href="https://healthdataeu.pages.code.europa.eu/healthdcat-ap/releases/release-6/index.html"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={11} />
                          HealthDCAT-AP Spec
                        </a>
                        {d.conformsTo?.includes("fhir") && (
                          <a
                            href="https://hl7.org/fhir/R4/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-orange-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={11} />
                            FHIR R4 Spec
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Data model diagram modal */}
        {diagramDataset && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setDiagramDataset(null)}
          >
            <div
              className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
                <h2 className="font-semibold text-sm text-layer2">
                  <GitBranch size={14} className="inline mr-1.5" />
                  HealthDCAT-AP Data Model — {diagramDataset.title}
                </h2>
                <button
                  onClick={() => setDiagramDataset(null)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-5">
                <MermaidDiagram
                  chart={buildDcatApDiagram(diagramDataset)}
                  caption={`HealthDCAT-AP entity-relationship model for "${diagramDataset.title}"`}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
