"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  Edit3,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Download,
  ExternalLink,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

/* ── Types ─────────────────────────────────────────── */

interface DatasetEntry {
  id: string;
  title: string;
  description: string;
  license: string;
  conformsTo: string;
  publisher: string;
  theme: string;
  datasetType: string;
  legalBasis: string;
  recordCount: number | null;
  // Extended HealthDCAT-AP fields
  personalData?: boolean;
  sensitiveData?: boolean;
  purpose?: string;
  populationCoverage?: string;
  numberOfUniqueIndividuals?: number | null;
  healthCategory?: string;
  minTypicalAge?: number | null;
  maxTypicalAge?: number | null;
  publisherType?: string;
  language?: string;
  spatial?: string;
}

type Tab = "browse" | "create";

const EMPTY_ENTRY: Omit<DatasetEntry, "id"> = {
  title: "",
  description: "",
  license: "CC-BY-4.0",
  conformsTo: "http://hl7.org/fhir/R4",
  publisher: "",
  theme: "",
  datasetType: "",
  legalBasis: "EHDS Article 53 Secondary Use",
  recordCount: null,
  personalData: false,
  sensitiveData: false,
  purpose: "",
  populationCoverage: "",
  numberOfUniqueIndividuals: null,
  healthCategory: "",
  minTypicalAge: null,
  maxTypicalAge: null,
  publisherType: "",
  language: "en",
  spatial: "",
};

const DATASET_TYPES = [
  "SyntheticData",
  "RealWorldData",
  "ClinicalTrial",
  "Registry",
  "AnalyticsData",
  "ObservationalStudy",
  "Biobank",
  "AdminHealth",
];

const PUBLISHER_TYPES = ["DataHolder", "HDAB", "Researcher", "DataUser"];

const LEGAL_BASIS_OPTIONS = [
  "EHDS Article 33 Primary Use",
  "EHDS Article 53 Secondary Use",
  "GDPR Article 6(1)(a) Consent",
  "GDPR Article 9(2)(j) Research",
];

const THEMES = [
  "Patient Summary",
  "Clinical Research",
  "Cancer Registry",
  "Rare Disease",
  "Genomics",
  "Epidemiology",
  "Drug Safety",
  "Public Health",
  "Medical Imaging",
  "Lab & Diagnostics",
];

const LICENSES = [
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-NC-4.0",
  "CC-BY-NC-SA-4.0",
  "CC0-1.0",
  "MIT",
];

const PUBLISHERS = [
  "AlphaKlinik Berlin",
  "PharmaCo Research AG",
  "MedReg DE",
  "Limburg Medical Centre",
  "Institut de Recherche Santé",
];

/* ── Helpers ───────────────────────────────────────── */

function generateId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `dataset:${slug || "untitled"}-${Date.now().toString(36)}`;
}

/* ── RDF Turtle export (EHDS editor compatible) ────── */

/** Escape a string for Turtle literal */
function ttlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** Map legal basis label → ELI URI used by the EHDS editor */
const LEGAL_BASIS_URI: Record<string, string> = {
  "EHDS Article 33 Primary Use": "http://data.europa.eu/eli/reg/2025/327/oj",
  "EHDS Article 53 Secondary Use": "http://data.europa.eu/eli/reg/2025/327/oj",
  "GDPR Article 6(1)(a) Consent": "http://data.europa.eu/eli/reg/2016/679/oj",
  "GDPR Article 9(2)(j) Research": "http://data.europa.eu/eli/reg/2016/679/oj",
};

/** Map dataset type → EU authority table URI */
const DATASET_TYPE_URI: Record<string, string> = {
  SyntheticData:
    "http://publications.europa.eu/resource/authority/dataset-type/SYNTHETIC",
  RealWorldData:
    "http://publications.europa.eu/resource/authority/dataset-type/STATISTICAL",
  ClinicalTrial:
    "http://publications.europa.eu/resource/authority/dataset-type/CLINICAL_TRIAL",
  Registry:
    "http://publications.europa.eu/resource/authority/dataset-type/CODE_LIST",
  AnalyticsData:
    "http://publications.europa.eu/resource/authority/dataset-type/STATISTICAL",
  ObservationalStudy:
    "http://publications.europa.eu/resource/authority/dataset-type/STATISTICAL",
  Biobank:
    "http://publications.europa.eu/resource/authority/dataset-type/CODE_LIST",
  AdminHealth:
    "http://publications.europa.eu/resource/authority/dataset-type/STATISTICAL",
};

/**
 * Serialize a DatasetEntry as RDF Turtle compatible with the EHDS
 * HealthDCAT-AP Editor at https://ehds.healthdataportal.eu/editor2/
 */
function buildTurtle(entry: DatasetEntry): string {
  const datasetUri = `<https://ehds-demo.local/dataset/${encodeURIComponent(
    entry.id,
  )}>`;
  const lang = entry.language || "en";
  const now = new Date().toISOString().split("T")[0];

  const lines: string[] = [
    `@prefix dcat: <http://www.w3.org/ns/dcat#> .`,
    `@prefix dct: <http://purl.org/dc/terms/> .`,
    `@prefix foaf: <http://xmlns.com/foaf/0.1/> .`,
    `@prefix healthdcatap: <http://healthdataportal.eu/ns/health#> .`,
    `@prefix dcatap: <http://data.europa.eu/r5r/> .`,
    `@prefix dpv: <https://w3id.org/dpv#> .`,
    `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`,
    `@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .`,
    ``,
    `${datasetUri} a dcat:Dataset ;`,
  ];

  // Mandatory fields
  lines.push(`    dct:title "${ttlEscape(entry.title)}"@${lang} ;`);
  if (entry.description) {
    lines.push(
      `    dct:description "${ttlEscape(entry.description)}"@${lang} ;`,
    );
  }
  lines.push(`    dct:identifier "${ttlEscape(entry.id)}" ;`);
  lines.push(`    dct:issued "${now}"^^xsd:date ;`);
  lines.push(`    dct:modified "${now}"^^xsd:date ;`);

  // Publisher
  if (entry.publisher) {
    lines.push(
      `    dct:publisher [ a foaf:Organization ; foaf:name "${ttlEscape(
        entry.publisher,
      )}"@${lang} ] ;`,
    );
  }

  // Theme / keyword
  if (entry.theme) {
    lines.push(`    dcat:keyword "${ttlEscape(entry.theme)}"@${lang} ;`);
    lines.push(`    dcat:theme "${ttlEscape(entry.theme)}" ;`);
  }

  // Language
  if (entry.language) {
    const langUri = `http://publications.europa.eu/resource/authority/language/${entry.language.toUpperCase()}`;
    lines.push(`    dct:language <${langUri}> ;`);
  }

  // Spatial coverage
  if (entry.spatial) {
    lines.push(
      `    dct:spatial <http://publications.europa.eu/resource/authority/country/${entry.spatial.toUpperCase()}> ;`,
    );
  }

  // Conforms to
  if (entry.conformsTo) {
    lines.push(`    dct:conformsTo <${entry.conformsTo}> ;`);
  }

  // License
  if (entry.license) {
    lines.push(
      `    dct:license <https://creativecommons.org/licenses/${entry.license
        .toLowerCase()
        .replace("cc-", "")
        .replace("-4.0", "/4.0/")}> ;`,
    );
  }

  // Dataset type
  if (entry.datasetType && DATASET_TYPE_URI[entry.datasetType]) {
    lines.push(`    dct:type <${DATASET_TYPE_URI[entry.datasetType]}> ;`);
  }

  // Applicable legislation (EHDS)
  const legalUri = entry.legalBasis
    ? LEGAL_BASIS_URI[entry.legalBasis]
    : undefined;
  if (legalUri) {
    lines.push(`    dcatap:applicableLegislation <${legalUri}> ;`);
  }

  // HealthDCAT-AP extensions
  if (entry.healthCategory) {
    lines.push(
      `    healthdcatap:healthCategory "${ttlEscape(
        entry.healthCategory,
      )}"@${lang} ;`,
    );
  }
  if (entry.purpose) {
    lines.push(
      `    healthdcatap:purpose "${ttlEscape(entry.purpose)}"@${lang} ;`,
    );
  }
  if (entry.populationCoverage) {
    lines.push(
      `    healthdcatap:populationCoverage "${ttlEscape(
        entry.populationCoverage,
      )}"@${lang} ;`,
    );
  }
  if (entry.personalData != null) {
    lines.push(
      `    dpv:hasPersonalData "${entry.personalData}"^^xsd:boolean ;`,
    );
  }
  if (entry.recordCount != null) {
    lines.push(
      `    healthdcatap:numberOfRecords "${entry.recordCount}"^^xsd:integer ;`,
    );
  }
  if (entry.numberOfUniqueIndividuals != null) {
    lines.push(
      `    healthdcatap:numberOfUniqueIndividuals "${entry.numberOfUniqueIndividuals}"^^xsd:integer ;`,
    );
  }
  if (entry.minTypicalAge != null) {
    lines.push(
      `    healthdcatap:minTypicalAge "${entry.minTypicalAge}"^^xsd:integer ;`,
    );
  }
  if (entry.maxTypicalAge != null) {
    lines.push(
      `    healthdcatap:maxTypicalAge "${entry.maxTypicalAge}"^^xsd:integer ;`,
    );
  }

  // Close the dataset with a period (replace last semicolon)
  const last = lines.length - 1;
  lines[last] = lines[last].replace(/ ;$/, " .");

  return lines.join("\n") + "\n";
}

/** Download a single dataset entry as RDF Turtle */
function downloadTurtle(entry: DatasetEntry) {
  const ttl = buildTurtle(entry);
  const blob = new Blob([ttl], { type: "text/turtle" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  a.download = `healthDCATAP_${slug || "dataset"}.ttl`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download all datasets as a single RDF Turtle file */
function downloadAllTurtle(entries: DatasetEntry[]) {
  const ttl = entries.map((e) => buildTurtle(e)).join("\n");
  const blob = new Blob([ttl], { type: "text/turtle" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z/, "");
  a.download = `healthDCATAP_RDF_${ts}.ttl`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Components ────────────────────────────────────── */

function FormField({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {help && (
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{help}</p>
      )}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm text-gray-200 outline-none focus:border-purple-500"
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function InputField({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm text-gray-200 outline-none focus:border-purple-500"
    />
  );
}

/* ── Main Page ─────────────────────────────────────── */

export default function DcatApEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-[var(--text-secondary)] p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}

function EditorContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("browse");
  const [datasets, setDatasets] = useState<DatasetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<DatasetEntry, "id">>(EMPTY_ENTRY);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const loadCatalog = useCallback(() => {
    fetchApi("/api/catalog")
      .then((r) => r.json())
      .then((d: DatasetEntry[]) => {
        setDatasets(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Deep-link: ?edit=<id>
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && datasets.length > 0) {
      const existing = datasets.find((d) => d.id === editId);
      if (existing) {
        startEdit(existing);
      }
    }
  }, [searchParams, datasets]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField<K extends keyof Omit<DatasetEntry, "id">>(
    key: K,
    value: Omit<DatasetEntry, "id">[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(entry: DatasetEntry) {
    setEditingId(entry.id);
    setForm({
      title: entry.title ?? "",
      description: entry.description ?? "",
      license: entry.license ?? "CC-BY-4.0",
      conformsTo: entry.conformsTo ?? "",
      publisher: entry.publisher ?? "",
      theme: entry.theme ?? "",
      datasetType: entry.datasetType ?? "",
      legalBasis: entry.legalBasis ?? "",
      recordCount: entry.recordCount ?? null,
      personalData: entry.personalData ?? false,
      sensitiveData: entry.sensitiveData ?? false,
      purpose: entry.purpose ?? "",
      populationCoverage: entry.populationCoverage ?? "",
      numberOfUniqueIndividuals: entry.numberOfUniqueIndividuals ?? null,
      healthCategory: entry.healthCategory ?? "",
      minTypicalAge: entry.minTypicalAge ?? null,
      maxTypicalAge: entry.maxTypicalAge ?? null,
      publisherType: entry.publisherType ?? "",
      language: entry.language ?? "en",
      spatial: entry.spatial ?? "",
    });
    setTab("create");
    setResult(null);
  }

  function startNew() {
    setEditingId(null);
    setForm({ ...EMPTY_ENTRY });
    setTab("create");
    setResult(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;

    setSaving(true);
    setResult(null);

    const payload = {
      ...(editingId ? { id: editingId } : { id: generateId(form.title) }),
      ...form,
      recordCount: form.recordCount ? Number(form.recordCount) : null,
      numberOfUniqueIndividuals: form.numberOfUniqueIndividuals
        ? Number(form.numberOfUniqueIndividuals)
        : null,
      minTypicalAge: form.minTypicalAge ? Number(form.minTypicalAge) : null,
      maxTypicalAge: form.maxTypicalAge ? Number(form.maxTypicalAge) : null,
    };

    try {
      const res = await fetchApi("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setResult({
          ok: true,
          message: editingId
            ? "Dataset metadata updated successfully."
            : "Dataset metadata created successfully.",
        });
        setEditingId(null);
        setForm({ ...EMPTY_ENTRY });
        loadCatalog();
        setTimeout(() => setTab("browse"), 1500);
      } else {
        const body = await res.text();
        setResult({ ok: false, message: body || "Failed to save." });
      }
    } catch (err) {
      setResult({
        ok: false,
        message: `Network error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetchApi(`/api/catalog?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadCatalog();
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="HealthDCAT-AP Editor"
        icon={BookOpen}
        description="Create and edit HealthDCAT-AP metadata entries for EHDS secondary-use datasets. This editor follows the HealthDCAT-AP 3.0 profile — an application profile of DCAT-AP extending W3C DCAT 3 with health-domain extensions required by the EHDS Regulation."
        prevStep={{ href: "/catalog", label: "Dataset Catalog" }}
        nextStep={{ href: "/data/discover", label: "Discover Data" }}
        infoText="Fields marked with * are mandatory per the HealthDCAT-AP specification. The editor generates unique dataset identifiers and stores metadata in the Neo4j graph database."
        docLink={{
          href: "https://healthdcat-ap.github.io/",
          label: "HealthDCAT-AP Specification",
          external: true,
        }}
      />

      {/* Tabs + Export actions */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setTab("browse")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "browse"
              ? "bg-purple-600 text-white"
              : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Browse ({datasets.length})
        </button>
        <button
          onClick={startNew}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
            tab === "create" && !editingId
              ? "bg-purple-600 text-white"
              : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Plus size={14} />
          New Entry
        </button>

        <div className="flex-1" />

        {datasets.length > 0 && (
          <button
            onClick={() => downloadAllTurtle(datasets)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-green-900/40 text-green-300 border border-green-700/50 hover:bg-green-900/60 transition-colors"
            title="Export all entries as RDF Turtle for the EHDS editor"
          >
            <Download size={14} />
            Export All (.ttl)
          </button>
        )}
        <a
          href="https://ehds.healthdataportal.eu/editor2/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Open the official EHDS HealthDCAT-AP editor"
        >
          <ExternalLink size={14} />
          EHDS Editor
        </a>
      </div>

      {/* Browse Tab */}
      {tab === "browse" && (
        <div>
          {loading ? (
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Loader2 size={16} className="animate-spin" />
              Loading catalog…
            </div>
          ) : datasets.length === 0 ? (
            <p className="text-[var(--text-secondary)]">
              No HealthDCAT-AP entries yet.{" "}
              <button
                onClick={startNew}
                className="text-purple-400 hover:underline"
              >
                Create one
              </button>
            </p>
          ) : (
            <div className="grid gap-3">
              {datasets.map((d, idx) => (
                <div
                  key={d.id ?? `entry-${idx}`}
                  className="border border-[var(--border)] rounded-xl p-4 hover:border-purple-500/50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-purple-300 truncate">
                        {d.title || d.id}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                        {d.description}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-[var(--text-secondary)]">
                        {d.publisher && <span>{d.publisher}</span>}
                        {d.theme && (
                          <span className="bg-purple-900/30 text-purple-300 px-1.5 py-0.5 rounded">
                            {d.theme}
                          </span>
                        )}
                        {d.datasetType && (
                          <span className="bg-gray-700 text-[var(--text-primary)] px-1.5 py-0.5 rounded">
                            {d.datasetType}
                          </span>
                        )}
                        {d.recordCount != null && (
                          <span>
                            {Number(d.recordCount).toLocaleString()} records
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => downloadTurtle(d)}
                        className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-green-300"
                        title="Download as RDF Turtle (.ttl) for EHDS editor"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => startEdit(d)}
                        className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-purple-300"
                        title="Edit entry"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-red-400"
                        title="Delete entry"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Tab */}
      {tab === "create" && (
        <form onSubmit={handleSave} className="space-y-6">
          {editingId && (
            <div className="text-xs text-[var(--text-secondary)] bg-[var(--surface-2)]/50 rounded px-3 py-2">
              Editing:{" "}
              <span className="text-[var(--text-primary)]">{editingId}</span>
            </div>
          )}

          {/* Section: DCAT-AP Mandatory */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-purple-400 border-b border-[var(--border)] pb-1 mb-2">
              DCAT-AP Mandatory Fields
            </legend>

            <FormField label="Title" required>
              <InputField
                value={form.title}
                onChange={(v) => setField("title", v)}
                placeholder="e.g. Synthetic FHIR R4 Patient Cohort"
              />
            </FormField>

            <FormField label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Describe the dataset contents, coverage and purpose…"
                rows={3}
                className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm text-gray-200 outline-none focus:border-purple-500 resize-y"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Publisher" required>
                <SelectField
                  value={form.publisher}
                  onChange={(v) => setField("publisher", v)}
                  options={PUBLISHERS}
                  placeholder="Select publisher…"
                />
              </FormField>

              <FormField
                label="Theme"
                help="EuroVoc health theme classification"
              >
                <SelectField
                  value={form.theme}
                  onChange={(v) => setField("theme", v)}
                  options={THEMES}
                  placeholder="Select theme…"
                />
              </FormField>
            </div>

            <FormField
              label="Language"
              help="ISO 639-1 code (e.g. en, de, nl, fr)"
            >
              <InputField
                value={form.language ?? ""}
                onChange={(v) => setField("language", v)}
                placeholder="en"
              />
            </FormField>
          </fieldset>

          {/* Section: DCAT-AP Recommended */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-purple-400 border-b border-[var(--border)] pb-1 mb-2">
              DCAT-AP Recommended Fields
            </legend>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Conforms To"
                help="Standard URI (e.g. http://hl7.org/fhir/R4)"
              >
                <InputField
                  value={form.conformsTo}
                  onChange={(v) => setField("conformsTo", v)}
                  placeholder="http://hl7.org/fhir/R4"
                />
              </FormField>

              <FormField
                label="Spatial Coverage"
                help="ISO 3166 country code (e.g. DE, NL, FR)"
              >
                <InputField
                  value={form.spatial ?? ""}
                  onChange={(v) => setField("spatial", v)}
                  placeholder="DE"
                />
              </FormField>
            </div>

            <FormField label="License">
              <SelectField
                value={form.license}
                onChange={(v) => setField("license", v)}
                options={LICENSES}
              />
            </FormField>
          </fieldset>

          {/* Section: HealthDCAT-AP Extensions */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-purple-400 border-b border-[var(--border)] pb-1 mb-2">
              HealthDCAT-AP Extensions
            </legend>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Dataset Type">
                <SelectField
                  value={form.datasetType}
                  onChange={(v) => setField("datasetType", v)}
                  options={DATASET_TYPES}
                  placeholder="Select type…"
                />
              </FormField>

              <FormField label="Publisher Type">
                <SelectField
                  value={form.publisherType ?? ""}
                  onChange={(v) => setField("publisherType", v)}
                  options={PUBLISHER_TYPES}
                  placeholder="Select role…"
                />
              </FormField>
            </div>

            <FormField label="Legal Basis for Access">
              <SelectField
                value={form.legalBasis}
                onChange={(v) => setField("legalBasis", v)}
                options={LEGAL_BASIS_OPTIONS}
              />
            </FormField>

            <FormField label="Purpose" help="Permitted purpose description">
              <InputField
                value={form.purpose ?? ""}
                onChange={(v) => setField("purpose", v)}
                placeholder="e.g. Secondary use for public health research"
              />
            </FormField>

            <FormField label="Population Coverage">
              <InputField
                value={form.populationCoverage ?? ""}
                onChange={(v) => setField("populationCoverage", v)}
                placeholder="e.g. Adult patients (18+) in Berlin region"
              />
            </FormField>

            <FormField label="Health Category" help="EEHRxF priority category">
              <InputField
                value={form.healthCategory ?? ""}
                onChange={(v) => setField("healthCategory", v)}
                placeholder="e.g. Patient Summary, ePrescription"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Contains Personal Data">
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    checked={form.personalData ?? false}
                    onChange={(e) => setField("personalData", e.target.checked)}
                    className="w-4 h-4 rounded bg-[var(--surface-2)] border-gray-600"
                  />
                  <span className="text-sm text-[var(--text-primary)]">
                    Yes
                  </span>
                </div>
              </FormField>

              <FormField label="Contains Sensitive Data">
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    checked={form.sensitiveData ?? false}
                    onChange={(e) =>
                      setField("sensitiveData", e.target.checked)
                    }
                    className="w-4 h-4 rounded bg-[var(--surface-2)] border-gray-600"
                  />
                  <span className="text-sm text-[var(--text-primary)]">
                    Yes
                  </span>
                </div>
              </FormField>
            </div>
          </fieldset>

          {/* Section: Statistics */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-purple-400 border-b border-[var(--border)] pb-1 mb-2">
              Statistics
            </legend>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Number of Records">
                <InputField
                  value={form.recordCount?.toString() ?? ""}
                  onChange={(v) =>
                    setField("recordCount", v ? parseInt(v, 10) : null)
                  }
                  placeholder="e.g. 10000"
                  type="number"
                />
              </FormField>

              <FormField label="Unique Individuals">
                <InputField
                  value={form.numberOfUniqueIndividuals?.toString() ?? ""}
                  onChange={(v) =>
                    setField(
                      "numberOfUniqueIndividuals",
                      v ? parseInt(v, 10) : null,
                    )
                  }
                  placeholder="e.g. 500"
                  type="number"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Min Typical Age">
                <InputField
                  value={form.minTypicalAge?.toString() ?? ""}
                  onChange={(v) =>
                    setField("minTypicalAge", v ? parseInt(v, 10) : null)
                  }
                  placeholder="e.g. 18"
                  type="number"
                />
              </FormField>

              <FormField label="Max Typical Age">
                <InputField
                  value={form.maxTypicalAge?.toString() ?? ""}
                  onChange={(v) =>
                    setField("maxTypicalAge", v ? parseInt(v, 10) : null)
                  }
                  placeholder="e.g. 90"
                  type="number"
                />
              </FormField>
            </div>
          </fieldset>

          {/* Result message */}
          {result && (
            <div
              className={`flex items-center gap-2 p-3 rounded text-sm ${
                result.ok
                  ? "bg-green-900/30 text-green-300"
                  : "bg-red-900/30 text-red-300"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              {result.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !form.title.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {editingId ? "Update Entry" : "Create Entry"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("browse");
                setEditingId(null);
                setForm({ ...EMPTY_ENTRY });
                setResult(null);
              }}
              className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-[var(--text-primary)] rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
