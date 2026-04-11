"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  ShieldCheck,
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
];

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
                            const policyBody = pObj["edc:policy"] as
                              | Record<string, unknown>
                              | undefined;
                            const perms = policyBody?.["odrl:permission"];
                            const firstPerm = Array.isArray(perms)
                              ? (perms[0] as Record<string, unknown>)
                              : undefined;
                            const purposeConstraint = (
                              (firstPerm?.["odrl:constraint"] as
                                | Record<string, unknown>[]
                                | undefined) || []
                            ).find(
                              (c: Record<string, unknown>) =>
                                (c["odrl:leftOperand"] as { "@id"?: string })?.[
                                  "@id"
                                ] === "edc:purpose",
                            );
                            const purposes = purposeConstraint
                              ? (purposeConstraint["odrl:rightOperand"] as
                                  | string
                                  | string[])
                              : null;
                            const purposeLabel = Array.isArray(purposes)
                              ? purposes.join(", ")
                              : purposes || "—";
                            return (
                              <div
                                key={i}
                                className="p-3 rounded-lg bg-[var(--surface-2)]/50 border border-[var(--border)]"
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <p className="text-sm font-medium text-[var(--text-primary)]">
                                      {(pObj["@id"] as string) ||
                                        `Policy #${i + 1}`}
                                    </p>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                      {purposeLabel}
                                    </p>
                                  </div>
                                </div>
                                <details>
                                  <summary className="cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                                    View full ODRL JSON
                                  </summary>
                                  <OdrlJsonHighlighter
                                    data={p}
                                    className="mt-2 max-h-48"
                                  />
                                </details>
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
      </div>
    </div>
  );
}
