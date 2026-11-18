"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { SignInRequired } from "@/components/SignInRequired";
import { useT } from "@/lib/i18n/translate";

// coverage is a validation result from scripts/eehrxf (#1144): full = every
// tested resource passes, partial = some do, none = none do, untested = the
// hub ingests nothing of that type.
interface EEHRxFProfile {
  profileId: string;
  name: string;
  igName: string;
  igPackage: string;
  fhirVersion: string;
  status: string;
  canonical: string;
  url: string;
  baseResource: string;
  coverage: string;
  tested: number;
  passed: number;
  failed: number;
  topIssues: string[];
  resourceCount: number;
}

interface EEHRxFCategory {
  categoryId: string;
  name: string;
  article: string;
  description: string;
  ehdsDeadline: string;
  ehdsGroup: number;
  status: string;
  totalResources: number;
  profileCount: number;
  tested: number;
  passed: number;
  profiles: EEHRxFProfile[];
}

interface EEHRxFData {
  categories: EEHRxFCategory[];
  summary: {
    totalCategories: number;
    totalProfiles: number;
    testedProfiles: number;
    passingProfiles: number;
    resourcesTested: number;
    resourcesPassed: number;
    passRatePercent: number;
    resourceCounts: Record<string, number>;
  };
  validation: {
    validatorVersion: string;
    maxPerSource: number;
    igs: string[];
  } | null;
  // HL7 Europe drafts the hub plans to track, not validated yet (#1145)
  planned?: {
    guideId: string;
    name: string;
    igPackage: string;
    status: string;
    url: string;
    issue: number | null;
    scope: string;
  }[];
}

const REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";

function percent(passed: number, tested: number): number {
  return tested > 0 ? Math.round((passed / tested) * 100) : 0;
}

// Shown through t(); __tests__/unit/lib/i18n-holder.test.ts lists the labels.
const EHDS_MILESTONES = [
  { year: "2025", label: "EHDS enters into force", active: true },
  {
    year: "2027",
    label: "Commission adopts implementing acts",
    active: false,
  },
  {
    year: "2029",
    label: "Group 1: Patient Summary + ePrescription",
    active: false,
  },
  {
    year: "2031",
    label: "Group 2: Lab + Discharge + Imaging",
    active: false,
  },
  { year: "2035", label: "Third countries join HealthData@EU", active: false },
];

function StatusBadge({ status }: { status: string }) {
  const t = useT("holder");
  switch (status) {
    case "available":
    case "full":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)">
          <CheckCircle size={12} />
          {t("Available")}
        </span>
      );
    case "partial":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-(--role-hdab-bg) text-(--role-hdab-text) border border-(--role-hdab-border)">
          <AlertTriangle size={12} />
          {t("Partial")}
        </span>
      );
    case "untested":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-(--surface-2) text-(--text-secondary) border border-(--border)">
          <Clock size={12} />
          {t("Not tested")}
        </span>
      );
    case "none":
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-(--role-admin-bg) text-(--role-admin-text) border border-(--role-admin-border)">
          <XCircle size={12} />
          {t("Gap")}
        </span>
      );
  }
}

function CoverageMeter({ percent }: { percent: number }) {
  const color =
    percent >= 80
      ? "bg-green-500"
      : percent >= 30
        ? "bg-yellow-500"
        : percent > 0
          ? "bg-orange-500"
          : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-(--surface-2) rounded-full h-2 overflow-hidden">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      <span className="text-xs text-(--text-secondary) w-9 text-right">
        {percent}%
      </span>
    </div>
  );
}

function ProfileRow({ profile }: { profile: EEHRxFProfile }) {
  const t = useT("holder");
  return (
    <div className="py-2 px-3 rounded-sm hover:bg-(--surface-2)/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-(--text-primary) truncate">
              {profile.name}
            </span>
            <span className="text-[10px] text-(--text-secondary) bg-(--surface-2) px-1.5 py-0.5 rounded-sm">
              {profile.fhirVersion}
            </span>
            <span className="text-[10px] text-(--text-secondary) bg-(--surface-2) px-1.5 py-0.5 rounded-sm">
              {profile.status}
            </span>
          </div>
          <div className="text-xs text-(--text-secondary) mt-0.5 truncate">
            {profile.baseResource} — {profile.igName}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-(--text-secondary) tabular-nums">
            {t("{n} in graph", { n: profile.resourceCount.toLocaleString() })}
          </span>
          {profile.tested > 0 && (
            <span className="text-xs text-(--text-primary) tabular-nums">
              {t("{passed}/{tested} pass", {
                passed: profile.passed,
                tested: profile.tested,
              })}
            </span>
          )}
          <StatusBadge status={profile.coverage} />
          {profile.url && (
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--text-secondary) hover:text-teal-800 dark:hover:text-teal-300 transition-colors"
              title={t("View IG specification")}
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
      {(profile.topIssues ?? []).length > 0 && (
        <details className="mt-1">
          <summary className="text-xs text-(--text-secondary) cursor-pointer">
            {t("Why resources fail")}
          </summary>
          <ul className="mt-1 ml-4 list-disc text-[11px] text-(--text-secondary) break-words">
            {profile.topIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function CategoryCard({ category }: { category: EEHRxFCategory }) {
  const t = useT("holder");
  const [expanded, setExpanded] = useState(category.status !== "none");

  const coverPct = percent(category.passed, category.tested);

  const groupColors: Record<number, string> = {
    1: "border-layer1",
    2: "border-layer2",
    3: "border-layer5",
  };

  return (
    <div
      className={`bg-(--surface) border rounded-xl overflow-hidden ${
        groupColors[category.ehdsGroup] ?? "border-(--border)"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-(--surface-2)/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={16} className="text-(--text-secondary) shrink-0" />
        ) : (
          <ChevronRight
            size={16}
            className="text-(--text-secondary) shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-(--text-primary)">
              {category.name}
            </h3>
            <StatusBadge status={category.status} />
          </div>
          <p className="text-xs text-(--text-secondary) line-clamp-1">
            {category.article ? `${category.article}: ` : ""}
            {category.description}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1.5 text-xs text-(--text-secondary) mb-1">
            <Clock size={12} />
            <span>
              {t("EHDS {deadline}", {
                deadline:
                  category.ehdsDeadline === "TBD"
                    ? t("TBD")
                    : category.ehdsDeadline,
              })}
            </span>
          </div>
          <div className="text-[10px] text-(--text-secondary)">
            {t("Group {n}", { n: category.ehdsGroup })} ·{" "}
            {t("{n} resources", {
              n: category.totalResources.toLocaleString(),
            })}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-(--border) px-5 pb-4">
          <div className="pt-3 pb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-(--text-secondary)">
                {t("Validation: {passed}/{tested} resources pass", {
                  passed: category.passed,
                  tested: category.tested,
                })}
              </span>
            </div>
            <CoverageMeter percent={coverPct} />
          </div>
          <div className="divide-y divide-gray-800/50">
            {category.profiles.map((p) => (
              <ProfileRow key={p.profileId} profile={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EEHRxFPage() {
  const t = useT("holder");
  const th = useT("home");
  const [data, setData] = useState<EEHRxFData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);

  useEffect(() => {
    fetchApi("/api/eehrxf")
      .then(async (r) => {
        if (r.status === 401) throw new Error("UNAUTHENTICATED");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.message === "UNAUTHENTICATED") setUnauthenticated(true);
        else setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <PageIntro
          title={t("EEHRxF Profile Alignment")}
          icon={Layers}
          description={t(
            "HL7 Europe FHIR R4 profiles for the EHDS priority categories, checked with the HL7 FHIR Validator against the FHIR resources the hub takes in.",
          )}
          prevStep={{ href: "/query", label: th("Natural Language Query") }}
          nextStep={{ href: "/compliance", label: t("EHDS Compliance") }}
          infoText={t(
            "The EHDS names six priority categories (Art. 14(1)). For each, the hub tracks the HL7 Europe profiles and validates a sample of its own resources against them. A pass is readiness evidence against the guides, not EHDS conformity, which needs the Art. 40 testing and an EU declaration of conformity (Art. 39).",
          )}
          docLink={{
            href: "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_14",
            label: t("EHDS Regulation, Art. 14"),
            external: true,
          }}
        />

        {unauthenticated ? (
          <SignInRequired
            description={t(
              "EEHRxF profile alignment is restricted to authenticated users. Sign in with one of the demo personas to see how your FHIR resources conform to the mandatory HL7 Europe profiles required by EHDS.",
            )}
          />
        ) : (
          <>
            {error && (
              <div className="mb-6 p-3 rounded-sm bg-(--role-admin-bg) border border-(--role-admin-border) text-(--role-admin-text) text-sm">
                {error}
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="bg-(--surface) border border-(--border) rounded-xl p-4 flex flex-col gap-1">
                <Layers
                  size={16}
                  className="text-teal-800 dark:text-teal-300"
                />
                <span className="text-2xl font-bold">
                  {loading ? "—" : data?.summary.totalCategories ?? 0}
                </span>
                <span className="text-xs text-(--text-secondary)">
                  {t("Priority Categories")}
                </span>
              </div>
              <div className="bg-(--surface) border border-(--border) rounded-xl p-4 flex flex-col gap-1">
                <ShieldCheck
                  size={16}
                  className="text-green-800 dark:text-green-300"
                />
                <span className="text-2xl font-bold">
                  {loading ? "—" : data?.summary.totalProfiles ?? 0}
                </span>
                <span className="text-xs text-(--text-secondary)">
                  {t("EU Profiles Tracked")}
                </span>
              </div>
              <div className="bg-(--surface) border border-(--border) rounded-xl p-4 flex flex-col gap-1">
                <CheckCircle size={16} className="text-(--success-text)" />
                <span className="text-2xl font-bold">
                  {loading ? "—" : data?.summary.passingProfiles ?? 0}
                </span>
                <span className="text-xs text-(--text-secondary)">
                  {t("Profiles Passing")}
                </span>
              </div>
              <div className="bg-(--surface) border border-(--border) rounded-xl p-4 flex flex-col gap-1">
                <AlertTriangle size={16} className="text-(--warning-text)" />
                <span className="text-2xl font-bold">
                  {loading ? "—" : `${data?.summary.passRatePercent ?? 0}%`}
                </span>
                <span className="text-xs text-(--text-secondary)">
                  {t("Resources Passing")}
                </span>
              </div>
            </div>

            {/* How the numbers are made */}
            {data?.validation && (
              <div className="bg-(--surface) border border-(--border) rounded-xl p-5 mb-8 text-xs text-(--text-secondary) flex flex-col gap-1.5">
                <h2 className="font-semibold text-sm text-(--text-primary)">
                  {t("How this is checked")}
                </h2>
                <p>
                  {t(
                    "HL7 FHIR Validator {version}, at most {n} resources per profile and source. A resource passes when the validator reports no error.",
                    {
                      version: data.validation.validatorVersion,
                      n: data.validation.maxPerSource,
                    },
                  )}
                </p>
                <p>
                  {t(
                    "Terminology is not checked: codes are checked for shape, not against SNOMED CT, LOINC or the value sets of the guides.",
                  )}
                </p>
                <p>
                  {t(
                    "Sources: the FHIR writer of Klarbefund and epa-ingest, and a seeded Synthea sample of what the hub loads.",
                  )}
                </p>
                <p className="font-mono text-[11px] break-words">
                  {data.validation.igs.join(" · ")}
                </p>
              </div>
            )}

            {/* EHDS Timeline */}
            <div className="bg-(--surface) border border-(--border) rounded-xl p-5 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={16} className="text-(--text-secondary)" />
                <h2 className="font-semibold text-sm text-(--text-primary)">
                  {t("EHDS Implementation Timeline")}
                </h2>
              </div>
              <div className="flex items-center gap-0 overflow-x-auto pb-2">
                {EHDS_MILESTONES.map((m, i) => (
                  <div key={m.year} className="flex items-center">
                    {i > 0 && (
                      <div className="w-8 sm:w-16 h-0.5 bg-gray-700 shrink-0" />
                    )}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className={`w-4 h-4 rounded-full border-2 ${
                          m.active
                            ? "bg-layer2 border-layer2"
                            : "bg-(--surface) border-(--border-ui)"
                        }`}
                      />
                      <span
                        className={`text-xs font-medium mt-1 ${
                          m.active
                            ? "text-teal-800 dark:text-teal-300"
                            : "text-(--text-secondary)"
                        }`}
                      >
                        {m.year}
                      </span>
                      <span className="text-[10px] text-(--text-secondary) text-center max-w-[100px] leading-tight mt-0.5">
                        {t(m.label)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Category cards */}
            {loading ? (
              <div className="text-(--text-secondary) text-sm">
                {t("Loading EEHRxF profiles…")}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {data?.categories.map((cat) => (
                  <CategoryCard key={cat.categoryId} category={cat} />
                ))}
              </div>
            )}

            {/* Planned guides: tracked, not validated yet */}
            {!loading && (data?.planned ?? []).length > 0 && (
              <section className="mt-8" aria-labelledby="eehrxf-planned">
                <h2
                  id="eehrxf-planned"
                  className="font-semibold text-sm text-(--text-primary) mb-1"
                >
                  {t("Planned: new HL7 Europe drafts")}
                </h2>
                <p className="text-xs text-(--text-secondary) mb-3">
                  {t(
                    "Not validated yet. Each becomes a validated profile when its issue is done. The Cancer Model is not one of the six priority categories.",
                  )}
                </p>
                <div className="flex flex-col gap-3">
                  {data?.planned?.map((g) => (
                    <div
                      key={g.guideId}
                      className="bg-(--surface) border border-dashed border-(--border) rounded-xl p-4"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-(--text-primary)">
                          {g.name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-(--surface-2) text-(--text-secondary) border border-(--border)">
                          <Clock size={12} />
                          {t("Planned")}
                        </span>
                        <span className="text-[10px] text-(--text-secondary) bg-(--surface-2) px-1.5 py-0.5 rounded-sm font-mono">
                          {g.igPackage}
                        </span>
                      </div>
                      <p className="text-xs text-(--text-secondary) mt-1">
                        {g.scope}
                      </p>
                      <div className="flex gap-4 mt-2 text-xs">
                        <a
                          href={g.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-(--text-secondary) hover:text-teal-800 dark:hover:text-teal-300"
                        >
                          <ExternalLink size={12} />
                          {t("Implementation guide")}
                        </a>
                        <a
                          href={
                            g.issue
                              ? `${REPO}/issues/${g.issue}`
                              : `${REPO}/discussions/1143`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-(--text-secondary) hover:text-teal-800 dark:hover:text-teal-300"
                        >
                          <ExternalLink size={12} />
                          {g.issue
                            ? t("Issue #{n}", { n: g.issue })
                            : t("Discussion #{n}", { n: 1143 })}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Reference links */}
        <div className="mt-10 border-t border-(--border) pt-6">
          <h3 className="text-sm font-semibold text-(--text-primary) mb-3">
            {t("References")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {[
              {
                label: t("EHDS Regulation (EU)"),
                url: "https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en",
              },
              {
                label: t("EHDS Regulation, Art. 14"),
                url: "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_14",
              },
              {
                label: "HL7 Europe FHIR IGs",
                url: "https://hl7.eu/fhir/",
              },
              {
                label: "HL7 EU Base & Core Profiles",
                url: "https://hl7.eu/fhir/base/",
              },
              {
                label: "HL7 EU Laboratory Report",
                url: "https://hl7.eu/fhir/laboratory/",
              },
              {
                label: "HL7 EU Hospital Discharge Report",
                url: "https://hl7.eu/fhir/hdr/",
              },
              {
                label: "HL7 FHIR Validator",
                url: "https://github.com/hapifhir/org.hl7.fhir.core",
              },
              {
                label: "xShare D7.4: EEHRxF in procurements",
                url: "https://xshare-project.eu/wp-content/uploads/2026/11/Guidance-for-Using-EHRxF-in-Procurements-in-the-Digital-Health-Ecosystem.pdf",
              },
              {
                label: "Xt-EHR Joint Action",
                url: "https://www.xt-ehr.eu/",
              },
            ].map((ref) => (
              <a
                key={ref.url}
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-(--text-secondary) hover:text-teal-800 dark:hover:text-teal-300 transition-colors"
              >
                <ExternalLink size={12} />
                {ref.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
