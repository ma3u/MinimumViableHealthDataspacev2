"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ListChecks,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import OdrlJsonHighlighter from "@/components/OdrlJsonHighlighter";

/* ── Types ────────────────────────────────────────────────────── */

interface PolicyGroup {
  participantId: string;
  identity: string;
  policies: unknown[];
  error?: string;
}

interface EhdsPolicyTemplate {
  id: string;
  label: string;
  article: string;
  description: string;
  /** Generates the EDC/ODRL policy body (without @context — added at submit) */
  build: (opts: { duration: string }) => Record<string, unknown>;
}

/* ── EHDS Art. 53 / Art. 7 Policy Templates ───────────────────── */

const DURATION_OPTIONS = [
  { value: "contractAgreement+90d", label: "90 days" },
  { value: "contractAgreement+180d", label: "180 days" },
  { value: "contractAgreement+365d", label: "1 year" },
  { value: "contractAgreement+730d", label: "2 years" },
  { value: "contractAgreement+1095d", label: "3 years" },
];

function odrlPermission(
  purposes: string[],
  duration: string,
  duties: Record<string, unknown>[],
) {
  return {
    "odrl:action": { "@id": "odrl:use" },
    "odrl:constraint": [
      {
        "odrl:leftOperand": { "@id": "edc:purpose" },
        "odrl:operator": { "@id": "odrl:isAnyOf" },
        "odrl:rightOperand": purposes,
      },
      {
        "odrl:leftOperand": { "@id": "edc:inForceDate" },
        "odrl:operator": { "@id": "odrl:lteq" },
        "odrl:rightOperand": {
          "@value": duration,
          "@type": "edc:duration",
        },
      },
    ],
    "odrl:duty": duties,
  };
}

const PROHIBIT_REIDENTIFY = {
  "odrl:action": { "@id": "edc:reIdentify" },
  "odrl:assignee": { "@id": "odrl:assignee" },
};
const PROHIBIT_COMMERCIALIZE = {
  "odrl:action": { "@id": "odrl:commercialize" },
  "odrl:assignee": { "@id": "odrl:assignee" },
};

const POLICY_TEMPLATES: EhdsPolicyTemplate[] = [
  {
    id: "ehds-art53-1c-research",
    label: "Scientific Research",
    article: "Art. 53(1)(c)",
    description:
      "Secondary use for scientific research in health or care. Requires anonymization (k-anonymity >= 5), data minimization, and prohibits re-identification and unapproved commercial use.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-research-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          odrlPermission(
            ["EHDS Article 53(1)(c) — scientific research"],
            duration,
            [
              {
                "odrl:action": { "@id": "edc:anonymize" },
                "odrl:constraint": [
                  {
                    "odrl:leftOperand": { "@id": "edc:kAnonymity" },
                    "odrl:operator": { "@id": "odrl:gteq" },
                    "odrl:rightOperand": 5,
                  },
                ],
              },
              { "odrl:action": { "@id": "edc:minimizeData" } },
            ],
          ),
        ],
        "odrl:prohibition": [PROHIBIT_REIDENTIFY, PROHIBIT_COMMERCIALIZE],
      },
    }),
  },
  {
    id: "ehds-art53-1a-public-health",
    label: "Public Health Surveillance",
    article: "Art. 53(1)(a)",
    description:
      "Secondary use for public health monitoring, threats, and environmental risk assessment. Requires pseudonymization, audit trail, and prohibits re-identification.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-public-health-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          odrlPermission(
            [
              "EHDS Article 53(1)(a) — public health surveillance",
              "EHDS Article 53(1)(a) — health threat assessment",
            ],
            duration,
            [
              { "odrl:action": { "@id": "edc:pseudonymize" } },
              { "odrl:action": { "@id": "edc:maintainAuditTrail" } },
            ],
          ),
        ],
        "odrl:prohibition": [PROHIBIT_REIDENTIFY],
      },
    }),
  },
  {
    id: "ehds-art53-1e-statistics",
    label: "Official Statistics",
    article: "Art. 53(1)(e)",
    description:
      "Secondary use for producing official statistics (national statistical offices). Requires anonymization (k >= 10), aggregate-only output, and prohibits individual-level publication.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-statistics-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          odrlPermission(
            ["EHDS Article 53(1)(e) — official statistics"],
            duration,
            [
              {
                "odrl:action": { "@id": "edc:anonymize" },
                "odrl:constraint": [
                  {
                    "odrl:leftOperand": { "@id": "edc:kAnonymity" },
                    "odrl:operator": { "@id": "odrl:gteq" },
                    "odrl:rightOperand": 10,
                  },
                ],
              },
              { "odrl:action": { "@id": "edc:aggregateOnly" } },
            ],
          ),
        ],
        "odrl:prohibition": [
          PROHIBIT_REIDENTIFY,
          {
            "odrl:action": { "@id": "edc:publishIndividualLevel" },
            "odrl:assignee": { "@id": "odrl:assignee" },
          },
        ],
      },
    }),
  },
  {
    id: "ehds-art53-1b-regulatory",
    label: "Regulatory / Pharmacovigilance",
    article: "Art. 53(1)(b)",
    description:
      "Secondary use for regulatory activities on medicinal products and medical devices (EMA, national competent authorities). Pseudonymized access with full audit trail.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-regulatory-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          odrlPermission(
            [
              "EHDS Article 53(1)(b) — pharmacovigilance",
              "EHDS Article 53(1)(b) — medical device safety",
            ],
            duration,
            [
              { "odrl:action": { "@id": "edc:pseudonymize" } },
              { "odrl:action": { "@id": "edc:maintainAuditTrail" } },
            ],
          ),
        ],
        "odrl:prohibition": [PROHIBIT_REIDENTIFY, PROHIBIT_COMMERCIALIZE],
      },
    }),
  },
  {
    id: "ehds-art53-1c-ai-training",
    label: "AI / ML Model Training",
    article: "Art. 53(1)(c) + GDPR Art. 89",
    description:
      "Training AI/ML models for health applications in a secure processing environment. Anonymized data only, no model memorization, no extraction of training data.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-ai-training-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          odrlPermission(
            ["EHDS Article 53(1)(c) — AI/ML model training in health"],
            duration,
            [
              {
                "odrl:action": { "@id": "edc:anonymize" },
                "odrl:constraint": [
                  {
                    "odrl:leftOperand": { "@id": "edc:kAnonymity" },
                    "odrl:operator": { "@id": "odrl:gteq" },
                    "odrl:rightOperand": 5,
                  },
                ],
              },
              {
                "odrl:action": { "@id": "edc:secureProcessingEnvironment" },
              },
            ],
          ),
        ],
        "odrl:prohibition": [
          PROHIBIT_REIDENTIFY,
          {
            "odrl:action": { "@id": "edc:extractTrainingData" },
            "odrl:assignee": { "@id": "odrl:assignee" },
          },
        ],
      },
    }),
  },
  {
    id: "ehds-art7-primary-crossborder",
    label: "Cross-border Care (Primary Use)",
    article: "Art. 7",
    description:
      "Primary use: cross-border access for treatment continuity (MyHealth@EU). Requires explicit patient consent, treating clinician only, and prohibits secondary use.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-crossborder-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          {
            "odrl:action": { "@id": "odrl:use" },
            "odrl:constraint": [
              {
                "odrl:leftOperand": { "@id": "edc:purpose" },
                "odrl:operator": { "@id": "odrl:eq" },
                "odrl:rightOperand":
                  "EHDS Article 7 — cross-border treatment continuity",
              },
              {
                "odrl:leftOperand": { "@id": "edc:patientConsent" },
                "odrl:operator": { "@id": "odrl:eq" },
                "odrl:rightOperand": "explicit",
              },
              {
                "odrl:leftOperand": { "@id": "edc:inForceDate" },
                "odrl:operator": { "@id": "odrl:lteq" },
                "odrl:rightOperand": {
                  "@value": duration,
                  "@type": "edc:duration",
                },
              },
            ],
            "odrl:duty": [
              { "odrl:action": { "@id": "edc:logAccess" } },
              { "odrl:action": { "@id": "edc:notifyPatient" } },
            ],
          },
        ],
        "odrl:prohibition": [
          {
            "odrl:action": { "@id": "edc:secondaryUse" },
            "odrl:assignee": { "@id": "odrl:assignee" },
          },
          {
            "odrl:action": { "@id": "edc:thirdPartySharing" },
            "odrl:assignee": { "@id": "odrl:assignee" },
          },
        ],
      },
    }),
  },
  {
    id: "ehds-art53-1d-health-technology",
    label: "Health Technology Assessment",
    article: "Art. 53(1)(d)",
    description:
      "Secondary use for health technology assessment (HTA bodies). Pseudonymized access with time limits and full audit trail. Prohibits re-identification and commercial use.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-hta-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          odrlPermission(
            ["EHDS Article 53(1)(d) — health technology assessment"],
            duration,
            [
              { "odrl:action": { "@id": "edc:pseudonymize" } },
              { "odrl:action": { "@id": "edc:maintainAuditTrail" } },
            ],
          ),
        ],
        "odrl:prohibition": [PROHIBIT_REIDENTIFY, PROHIBIT_COMMERCIALIZE],
      },
    }),
  },
  {
    id: "ehds-art53-1f-education",
    label: "Education & Teaching",
    article: "Art. 53(1)(f)",
    description:
      "Secondary use for education and teaching in health sciences. Anonymized data only, prohibits re-identification and publication of individual-level data.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-education-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          odrlPermission(
            ["EHDS Article 53(1)(f) — health professional education"],
            duration,
            [
              {
                "odrl:action": { "@id": "edc:anonymize" },
                "odrl:constraint": [
                  {
                    "odrl:leftOperand": { "@id": "edc:kAnonymity" },
                    "odrl:operator": { "@id": "odrl:gteq" },
                    "odrl:rightOperand": 5,
                  },
                ],
              },
            ],
          ),
        ],
        "odrl:prohibition": [
          PROHIBIT_REIDENTIFY,
          {
            "odrl:action": { "@id": "edc:publishIndividualLevel" },
            "odrl:assignee": { "@id": "odrl:assignee" },
          },
        ],
      },
    }),
  },
  {
    id: "ehds-art53-1g-personalized-medicine",
    label: "Personalized Medicine",
    article: "Art. 53(1)(g)",
    description:
      "Secondary use for personalized medicine activities. Requires explicit patient consent, treating physician only, and prohibits secondary use and third-party sharing.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-personalized-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          {
            "odrl:action": { "@id": "odrl:use" },
            "odrl:constraint": [
              {
                "odrl:leftOperand": { "@id": "edc:purpose" },
                "odrl:operator": { "@id": "odrl:eq" },
                "odrl:rightOperand":
                  "EHDS Article 53(1)(g) — personalized medicine",
              },
              {
                "odrl:leftOperand": { "@id": "edc:patientConsent" },
                "odrl:operator": { "@id": "odrl:eq" },
                "odrl:rightOperand": "explicit",
              },
              {
                "odrl:leftOperand": { "@id": "edc:inForceDate" },
                "odrl:operator": { "@id": "odrl:lteq" },
                "odrl:rightOperand": {
                  "@value": duration,
                  "@type": "edc:duration",
                },
              },
            ],
            "odrl:duty": [
              { "odrl:action": { "@id": "edc:logAccess" } },
              { "odrl:action": { "@id": "edc:notifyPatient" } },
            ],
          },
        ],
        "odrl:prohibition": [
          {
            "odrl:action": { "@id": "edc:secondaryUse" },
            "odrl:assignee": { "@id": "odrl:assignee" },
          },
          {
            "odrl:action": { "@id": "edc:thirdPartySharing" },
            "odrl:assignee": { "@id": "odrl:assignee" },
          },
        ],
      },
    }),
  },
  {
    id: "ehds-art50-crossborder-secondary",
    label: "Cross-border Secondary Use",
    article: "Art. 50–51",
    description:
      "Cross-border secondary use requiring approval from all participating HDABs. Data must remain in secure processing environment and cannot be extracted.",
    build: ({ duration }) => ({
      "@type": "edc:PolicyDefinition",
      "@id": `policy-ehds-crossborder-secondary-${Date.now()}`,
      "edc:policy": {
        "@type": "odrl:Set",
        "odrl:permission": [
          odrlPermission(
            [
              "EHDS Article 50 — cross-border secondary use",
              "EHDS Article 51 — multi-state research collaboration",
            ],
            duration,
            [
              {
                "odrl:action": { "@id": "edc:secureProcessingEnvironment" },
              },
              { "odrl:action": { "@id": "edc:pseudonymize" } },
              { "odrl:action": { "@id": "edc:maintainAuditTrail" } },
            ],
          ),
        ],
        "odrl:prohibition": [
          PROHIBIT_REIDENTIFY,
          {
            "odrl:action": { "@id": "edc:extractTrainingData" },
            "odrl:assignee": { "@id": "odrl:assignee" },
          },
        ],
      },
    }),
  },
];

/* ── ODRL Parsing Helpers ─────────────────────────────────────── */

/** Safely coerce unknown to array of Record */
function asArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  if (v && typeof v === "object") return [v as Record<string, unknown>];
  return [];
}

/** Extract @id from an ODRL node (object or string) */
function actionId(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "@id" in (v as Record<string, unknown>))
    return (v as { "@id": string })["@id"];
  return String(v ?? "");
}

/** Friendly display for ODRL/EDC action IDs */
function friendlyAction(v: unknown): string {
  const id = actionId(v);
  return friendlyId(id);
}

const FRIENDLY_NAMES: Record<string, string> = {
  "odrl:use": "Use",
  "odrl:commercialize": "Commercialize",
  "edc:reIdentify": "Re-identify",
  "edc:anonymize": "Anonymize",
  "edc:pseudonymize": "Pseudonymize",
  "edc:minimizeData": "Data minimization",
  "edc:maintainAuditTrail": "Audit trail",
  "edc:aggregateOnly": "Aggregate only",
  "edc:secureProcessingEnvironment": "Secure processing env.",
  "edc:extractTrainingData": "Extract training data",
  "edc:logAccess": "Log access",
  "edc:notifyPatient": "Notify patient",
  "edc:secondaryUse": "Secondary use",
  "edc:thirdPartySharing": "Third-party sharing",
  "edc:publishIndividualLevel": "Publish individual-level",
  "edc:kAnonymity": "k-anonymity",
  "edc:purpose": "Purpose",
  "edc:inForceDate": "Duration",
  "edc:patientConsent": "Patient consent",
};

function friendlyId(id: string): string {
  return FRIENDLY_NAMES[id] ?? id.replace(/^(odrl|edc):/, "");
}

const OP_LABELS: Record<string, string> = {
  "odrl:gteq": ">=",
  "odrl:lteq": "<=",
  "odrl:eq": "=",
  "odrl:gt": ">",
  "odrl:lt": "<",
  "odrl:isAnyOf": "is any of",
};

function friendlyOp(op: string): string {
  return OP_LABELS[op] ?? op.replace(/^odrl:/, "");
}

/* ── Component ────────────────────────────────────────────────── */

export default function AdminPoliciesPage() {
  const [groups, setGroups] = useState<PolicyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  /* Create-form state */
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    POLICY_TEMPLATES[0].id,
  );
  const [selectedParticipant, setSelectedParticipant] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(
    DURATION_OPTIONS[2].value,
  );
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  /* Edit / Delete state */
  const [editingPolicy, setEditingPolicy] = useState<{
    participantId: string;
    policyId: string;
    json: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<{
    participantId: string;
    policyId: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPolicies = useCallback(() => {
    setLoading(true);
    fetchApi("/api/admin/policies")
      .then((r) => (r.ok ? r.json() : ({} as Record<string, unknown>)))
      .then((d: Record<string, unknown>) => {
        const pArr = Array.isArray(d)
          ? d
          : (d.participants as PolicyGroup[]) || [];
        setGroups(pArr);
        if (!selectedParticipant && pArr.length > 0) {
          setSelectedParticipant(pArr[0].participantId);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedParticipant]);

  useEffect(() => {
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPolicies = groups.reduce(
    (sum, g) => sum + (Array.isArray(g.policies) ? g.policies.length : 0),
    0,
  );

  const tpl = POLICY_TEMPLATES.find((t) => t.id === selectedTemplate)!;

  const handleCreate = async () => {
    if (!selectedParticipant) {
      setFormMsg({ type: "err", text: "Select a participant first." });
      return;
    }
    setCreating(true);
    setFormMsg(null);
    try {
      const policy = tpl.build({ duration: selectedDuration });
      const res = await fetchApi("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: selectedParticipant, policy }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || `HTTP ${res.status}`,
        );
      }
      const result = await res.json().catch(() => ({}));
      const isOffline = (result as { offline?: boolean }).offline;
      setFormMsg({
        type: "ok",
        text: isOffline
          ? "Policy saved to local Neo4j registry (EDC-V management API is offline)"
          : "Policy created successfully.",
      });
      loadPolicies();
    } catch (e) {
      setFormMsg({
        type: "err",
        text: `Failed: ${e instanceof Error ? e.message : e}`,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingPolicy) return;
    setEditSaving(true);
    setEditMsg(null);
    try {
      JSON.parse(editingPolicy.json); // validate JSON
    } catch {
      setEditMsg({ type: "err", text: "Invalid JSON" });
      setEditSaving(false);
      return;
    }
    try {
      const res = await fetchApi("/api/admin/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: editingPolicy.participantId,
          policyId: editingPolicy.policyId,
          policy: JSON.parse(editingPolicy.json),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || `HTTP ${res.status}`,
        );
      }
      setEditMsg({ type: "ok", text: "Policy updated." });
      setEditingPolicy(null);
      loadPolicies();
    } catch (e) {
      setEditMsg({
        type: "err",
        text: `Failed: ${e instanceof Error ? e.message : e}`,
      });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPolicy) return;
    setDeleting(true);
    try {
      const res = await fetchApi("/api/admin/policies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: deletingPolicy.participantId,
          policyId: deletingPolicy.policyId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || `HTTP ${res.status}`,
        );
      }
      setDeletingPolicy(null);
      loadPolicies();
    } catch {
      // In static mode DELETE returns synthetic 200 — just close and reload
      setDeletingPolicy(null);
      loadPolicies();
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = (participantId: string, policy: unknown) => {
    const pObj = policy as Record<string, unknown>;
    const cloned = JSON.parse(JSON.stringify(pObj));
    const oldId = (cloned["@id"] as string) || "policy";
    cloned["@id"] = `${oldId}-copy-${Date.now()}`;
    setEditingPolicy({
      participantId,
      policyId: "", // new policy, no existing ID
      json: JSON.stringify(cloned, null, 2),
    });
    setEditMsg(null);
  };

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-8 py-10">
        {/* ── Page header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="page-header">Policy Definitions</h1>
            <p className="text-[var(--text-secondary)] text-lg mt-1">
              ODRL policies · EHDS Regulation (EU) 2025/327
            </p>
          </div>
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setFormMsg(null);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-[var(--accent)] text-white dark:text-gray-900 hover:opacity-90 transition-opacity"
          >
            {showForm ? (
              <>
                <X size={14} /> Close
              </>
            ) : (
              <>
                <Plus size={14} /> Create Policy
              </>
            )}
          </button>
        </div>

        {/* ── Create Form ──────────────────────────────────────────── */}
        {showForm && (
          <div className="mb-8 border border-layer2 rounded-xl p-5 bg-[var(--surface)]/40">
            <h2 className="text-lg font-semibold mb-4">
              Create EHDS Policy Definition
            </h2>

            {/* Template selector */}
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Policy Template
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
              {POLICY_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    selectedTemplate === t.id
                      ? "border-layer2 bg-layer2/10"
                      : "border-[var(--border)] hover:border-gray-500"
                  }`}
                >
                  <span className="text-xs font-mono text-teal-800 dark:text-teal-300">
                    {t.article}
                  </span>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t.label}
                  </p>
                </button>
              ))}
            </div>

            {/* Selected template description */}
            <div className="mb-4 p-3 rounded-lg bg-[var(--surface-2)]/50 border border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)]">
                {tpl.description}
              </p>
            </div>

            {/* Participant + Duration row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  Participant Context
                </label>
                <select
                  aria-label="Participant Context"
                  value={selectedParticipant}
                  onChange={(e) => setSelectedParticipant(e.target.value)}
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border-ui)] text-sm px-3 py-2 text-[var(--text-primary)]"
                >
                  <option value="">— select —</option>
                  {groups.map((g) => (
                    <option key={g.participantId} value={g.participantId}>
                      {g.identity
                        ?.replace("did:web:", "")
                        .replace(/%3A/g, ":") || g.participantId.slice(0, 20)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  Access Duration
                </label>
                <select
                  aria-label="Access Duration"
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value)}
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border-ui)] text-sm px-3 py-2 text-[var(--text-primary)]"
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview */}
            <details className="mb-4">
              <summary className="cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Preview ODRL policy JSON
              </summary>
              <OdrlJsonHighlighter
                data={tpl.build({ duration: selectedDuration })}
                className="mt-2 p-3 rounded-lg bg-[var(--surface-2)]/50 border border-[var(--border)] max-h-60"
              />
            </details>

            {/* Submit */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreate}
                disabled={creating || !selectedParticipant}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white dark:text-gray-900 text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                Create Policy
              </button>
              {formMsg && (
                <span
                  className={`text-xs ${
                    formMsg.type === "ok"
                      ? "text-[var(--success-text)]"
                      : "text-[var(--danger-text)]"
                  }`}
                >
                  {formMsg.text}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Stats ────────────────────────────────────────────────── */}
        {!loading && (
          <div className="flex gap-4 mb-6 text-xs text-[var(--text-secondary)]">
            <span>{groups.length} participants</span>
            <span>&middot;</span>
            <span>{totalPolicies} total policies</span>
          </div>
        )}

        {/* ── Policy List ──────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading policies&hellip;
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <ShieldCheck
              size={40}
              className="text-[var(--text-secondary)] mx-auto mb-4"
            />
            <p className="text-[var(--text-secondary)]">No policies found</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {groups.map((g) => {
              const isOpen = expanded === g.participantId;
              const policies = Array.isArray(g.policies) ? g.policies : [];
              return (
                <div
                  key={g.participantId}
                  className={`border rounded-xl transition-colors ${
                    isOpen
                      ? "border-layer2 bg-[var(--surface)]/60"
                      : "border-[var(--border)] hover:border-layer2"
                  }`}
                >
                  <button
                    className="w-full text-left p-4"
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${
                      g.identity
                        ?.replace("did:web:", "")
                        .replace(/%3A/g, ":") || g.participantId.slice(0, 16)
                    }`}
                    onClick={() => setExpanded(isOpen ? null : g.participantId)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {g.identity
                            ?.replace("did:web:", "")
                            .replace(/%3A/g, ":") ||
                            g.participantId.slice(0, 16)}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {policies.length} polic
                          {policies.length === 1 ? "y" : "ies"}
                          {g.error && (
                            <span className="text-red-800 dark:text-red-400 ml-2">
                              ({g.error})
                            </span>
                          )}
                        </p>
                      </div>
                      {isOpen ? (
                        <ChevronUp
                          size={16}
                          className="text-[var(--text-secondary)]"
                        />
                      ) : (
                        <ChevronDown
                          size={16}
                          className="text-[var(--text-secondary)]"
                        />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-[var(--border)] pt-3">
                      {policies.length === 0 ? (
                        <p className="text-[var(--text-secondary)] text-sm">
                          No policies defined
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {policies.map((p, i) => {
                            const pObj = p as Record<string, unknown>;
                            const policyBody = (pObj["edc:policy"] ??
                              pObj.policy ??
                              pObj) as Record<string, unknown>;
                            const perms = asArray(
                              policyBody["odrl:permission"] ??
                                policyBody["permission"],
                            );
                            const prohibs = asArray(
                              policyBody["odrl:prohibition"] ??
                                policyBody["prohibition"],
                            );

                            // Extract structured data from first permission
                            const firstPerm = perms[0] as
                              | Record<string, unknown>
                              | undefined;
                            const constraints = asArray(
                              firstPerm?.["odrl:constraint"] ??
                                firstPerm?.["constraint"],
                            );
                            const duties = asArray(
                              firstPerm?.["odrl:duty"] ?? firstPerm?.["duty"],
                            );

                            // Extract purpose
                            const purposeC = constraints.find(
                              (c) =>
                                actionId(
                                  c["odrl:leftOperand"] ?? c["leftOperand"],
                                ) === "edc:purpose",
                            );
                            const purposes = purposeC
                              ? purposeC["odrl:rightOperand"] ??
                                purposeC["rightOperand"]
                              : null;
                            const purposeLabel = Array.isArray(purposes)
                              ? purposes.join("; ")
                              : typeof purposes === "string"
                                ? purposes
                                : "—";

                            // Extract duration
                            const durationC = constraints.find(
                              (c) =>
                                actionId(
                                  c["odrl:leftOperand"] ?? c["leftOperand"],
                                ) === "edc:inForceDate",
                            );
                            const durationVal = durationC
                              ? ((durationC["odrl:rightOperand"] ??
                                  durationC["rightOperand"]) as
                                  | { "@value"?: string }
                                  | string)
                              : null;
                            const durationStr =
                              typeof durationVal === "string"
                                ? durationVal
                                : durationVal?.["@value"] ?? null;
                            const durationLabel = durationStr
                              ? durationStr
                                  .replace("contractAgreement+", "")
                                  .replace("d", " days")
                                  .replace("365 days", "1 year")
                                  .replace("730 days", "2 years")
                                  .replace("1095 days", "3 years")
                              : null;

                            return (
                              <div
                                key={i}
                                className="rounded-lg bg-[var(--surface-2)]/50 border border-[var(--border)] overflow-hidden"
                              >
                                {/* Header */}
                                <div className="px-4 py-3 border-b border-[var(--border)]/50">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                        {(pObj["@id"] as string) ||
                                          `Policy #${i + 1}`}
                                      </p>
                                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                                        {purposeLabel}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {durationLabel && (
                                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                          <Clock size={10} />
                                          {durationLabel}
                                        </span>
                                      )}
                                      <button
                                        title="Edit policy JSON"
                                        onClick={() => {
                                          setEditingPolicy({
                                            participantId: g.participantId,
                                            policyId:
                                              (pObj["@id"] as string) || "",
                                            json: JSON.stringify(p, null, 2),
                                          });
                                          setEditMsg(null);
                                        }}
                                        className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        title="Duplicate policy"
                                        onClick={() =>
                                          handleDuplicate(g.participantId, p)
                                        }
                                        className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                      >
                                        <Copy size={13} />
                                      </button>
                                      <button
                                        title="Delete policy"
                                        onClick={() =>
                                          setDeletingPolicy({
                                            participantId: g.participantId,
                                            policyId:
                                              (pObj["@id"] as string) || "",
                                          })
                                        }
                                        className="p-1 rounded hover:bg-red-500/10 text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Structured body */}
                                <div className="px-4 py-3 space-y-2.5">
                                  {/* Permissions */}
                                  {perms.length > 0 && (
                                    <div className="flex items-start gap-2">
                                      <Check
                                        size={13}
                                        className="text-green-600 dark:text-green-400 mt-0.5 shrink-0"
                                      />
                                      <div className="text-xs">
                                        <span className="font-semibold text-green-700 dark:text-green-400">
                                          Permissions
                                        </span>
                                        <span className="text-[var(--text-secondary)] ml-1">
                                          {perms
                                            .map((pm) =>
                                              friendlyAction(
                                                pm["odrl:action"] ??
                                                  pm["action"],
                                              ),
                                            )
                                            .join(", ")}
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Duties */}
                                  {duties.length > 0 && (
                                    <div className="flex items-start gap-2">
                                      <ListChecks
                                        size={13}
                                        className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0"
                                      />
                                      <div className="text-xs">
                                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                                          Duties
                                        </span>
                                        <span className="text-[var(--text-secondary)] ml-1">
                                          {duties
                                            .map((d) => {
                                              const act = friendlyAction(
                                                d["odrl:action"] ?? d["action"],
                                              );
                                              const dc = asArray(
                                                d["odrl:constraint"] ??
                                                  d["constraint"],
                                              );
                                              if (dc.length > 0) {
                                                const cv = dc[0];
                                                const lo = actionId(
                                                  cv["odrl:leftOperand"] ??
                                                    cv["leftOperand"],
                                                );
                                                const op = actionId(
                                                  cv["odrl:operator"] ??
                                                    cv["operator"],
                                                );
                                                const rv =
                                                  cv["odrl:rightOperand"] ??
                                                  cv["rightOperand"];
                                                return `${act} (${friendlyId(
                                                  lo,
                                                )} ${friendlyOp(op)} ${rv})`;
                                              }
                                              return act;
                                            })
                                            .join(", ")}
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Prohibitions */}
                                  {prohibs.length > 0 && (
                                    <div className="flex items-start gap-2">
                                      <Ban
                                        size={13}
                                        className="text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                                      />
                                      <div className="text-xs">
                                        <span className="font-semibold text-red-700 dark:text-red-400">
                                          Prohibitions
                                        </span>
                                        <span className="text-[var(--text-secondary)] ml-1">
                                          {prohibs
                                            .map((pr) =>
                                              friendlyAction(
                                                pr["odrl:action"] ??
                                                  pr["action"],
                                              ),
                                            )
                                            .join(", ")}
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Constraints summary */}
                                  {constraints.filter(
                                    (c) =>
                                      actionId(
                                        c["odrl:leftOperand"] ??
                                          c["leftOperand"],
                                      ) !== "edc:purpose" &&
                                      actionId(
                                        c["odrl:leftOperand"] ??
                                          c["leftOperand"],
                                      ) !== "edc:inForceDate",
                                  ).length > 0 && (
                                    <div className="flex items-start gap-2">
                                      <Lock
                                        size={13}
                                        className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
                                      />
                                      <div className="text-xs">
                                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                                          Constraints
                                        </span>
                                        <span className="text-[var(--text-secondary)] ml-1">
                                          {constraints
                                            .filter(
                                              (c) =>
                                                actionId(
                                                  c["odrl:leftOperand"] ??
                                                    c["leftOperand"],
                                                ) !== "edc:purpose" &&
                                                actionId(
                                                  c["odrl:leftOperand"] ??
                                                    c["leftOperand"],
                                                ) !== "edc:inForceDate",
                                            )
                                            .map((c) => {
                                              const lo = actionId(
                                                c["odrl:leftOperand"] ??
                                                  c["leftOperand"],
                                              );
                                              const op = actionId(
                                                c["odrl:operator"] ??
                                                  c["operator"],
                                              );
                                              const rv =
                                                c["odrl:rightOperand"] ??
                                                c["rightOperand"];
                                              return `${friendlyId(
                                                lo,
                                              )} ${friendlyOp(op)} ${rv}`;
                                            })
                                            .join(", ")}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Raw JSON toggle */}
                                <div className="px-4 pb-3">
                                  <details>
                                    <summary className="cursor-pointer text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                                      View full ODRL JSON
                                    </summary>
                                    <OdrlJsonHighlighter
                                      data={p}
                                      className="mt-2 max-h-48"
                                    />
                                  </details>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Edit Modal ──────────────────────────────────────────── */}
        {editingPolicy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {editingPolicy.policyId
                    ? `Edit: ${editingPolicy.policyId}`
                    : "New Policy (duplicated)"}
                </h3>
                <button
                  onClick={() => setEditingPolicy(null)}
                  className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-secondary)]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-5">
                <textarea
                  value={editingPolicy.json}
                  onChange={(e) =>
                    setEditingPolicy({
                      ...editingPolicy,
                      json: e.target.value,
                    })
                  }
                  spellCheck={false}
                  className="w-full h-80 font-mono text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 text-[var(--text-primary)] resize-y"
                />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
                <div>
                  {editMsg && (
                    <span
                      className={`text-xs ${
                        editMsg.type === "ok"
                          ? "text-[var(--success-text)]"
                          : "text-[var(--danger-text)]"
                      }`}
                    >
                      {editMsg.text}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingPolicy(null)}
                    className="px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={editSaving}
                    className="px-3 py-1.5 rounded-lg text-xs bg-[var(--accent)] text-white dark:text-gray-900 font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 transition-opacity"
                  >
                    {editSaving && (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                    {editingPolicy.policyId ? "Save Changes" : "Create Policy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Confirmation ─────────────────────────────────── */}
        {deletingPolicy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                Delete Policy
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Are you sure you want to delete{" "}
                <span className="font-mono font-medium text-[var(--text-primary)]">
                  {deletingPolicy.policyId || "this policy"}
                </span>
                ? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setDeletingPolicy(null)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-xs bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  {deleting && <Loader2 size={12} className="animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
