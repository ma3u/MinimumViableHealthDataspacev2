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

interface EEHRxFProfile {
  profileId: string;
  name: string;
  igName: string;
  igPackage: string;
  fhirVersion: string;
  status: string;
  url: string;
  baseResource: string;
  description: string;
  coverage: string;
  resourceCount: number;
}

interface EEHRxFCategory {
  categoryId: string;
  name: string;
  description: string;
  ehdsDeadline: string;
  ehdsGroup: number;
  status: string;
  totalResources: number;
  profileCount: number;
  profiles: EEHRxFProfile[];
}

interface EEHRxFData {
  categories: EEHRxFCategory[];
  summary: {
    totalCategories: number;
    totalProfiles: number;
    coveredProfiles: number;
    coveragePercent: number;
    resourceCounts: Record<string, number>;
  };
}

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
  switch (status) {
    case "available":
    case "full":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-700/50">
          <CheckCircle size={12} />
          Available
        </span>
      );
    case "partial":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-700/50">
          <AlertTriangle size={12} />
          Partial
        </span>
      );
    case "none":
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-700/50">
          <XCircle size={12} />
          Gap
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
      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 w-9 text-right">{percent}%</span>
    </div>
  );
}

function ProfileRow({ profile }: { profile: EEHRxFProfile }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded hover:bg-gray-800/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200 truncate">
            {profile.name}
          </span>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
            {profile.fhirVersion}
          </span>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
            {profile.status}
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">
          {profile.baseResource} — {profile.igName}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-400 tabular-nums">
          {profile.resourceCount.toLocaleString()} resources
        </span>
        <StatusBadge status={profile.coverage} />
        {profile.url && (
          <a
            href={profile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-layer2 transition-colors"
            title="View IG specification"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: EEHRxFCategory }) {
  const [expanded, setExpanded] = useState(category.status !== "none");

  const profileCovered = category.profiles.filter(
    (p) => p.coverage === "full" || p.coverage === "partial",
  ).length;
  const profileTotal = category.profiles.length;
  const coverPct =
    profileTotal > 0 ? Math.round((profileCovered / profileTotal) * 100) : 0;

  const groupColors: Record<number, string> = {
    1: "border-layer1",
    2: "border-layer2",
    3: "border-layer5",
  };

  return (
    <div
      className={`bg-gray-900 border rounded-xl overflow-hidden ${
        groupColors[category.ehdsGroup] ?? "border-gray-700"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-gray-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={16} className="text-gray-500 shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-gray-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-100">{category.name}</h3>
            <StatusBadge status={category.status} />
          </div>
          <p className="text-xs text-gray-500 line-clamp-1">
            {category.description}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
            <Clock size={12} />
            <span>
              EHDS{" "}
              {category.ehdsDeadline === "TBD" ? "TBD" : category.ehdsDeadline}
            </span>
          </div>
          <div className="text-[10px] text-gray-500">
            Group {category.ehdsGroup} ·{" "}
            {category.totalResources.toLocaleString()} resources
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 px-5 pb-4">
          <div className="pt-3 pb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">
                Profile Coverage: {profileCovered}/{profileTotal} profiles
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
  const [data, setData] = useState<EEHRxFData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/eehrxf")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <PageIntro
        title="EEHRxF Profile Alignment"
        icon={Layers}
        description="European Electronic Health Record Exchange Format — HL7 Europe FHIR R4 Implementation Guides mapped to current graph data. Verify how well your FHIR resources conform to the mandatory EEHRxF profiles required by the EHDS regulation."
        prevStep={{ href: "/query", label: "Natural Language Query" }}
        nextStep={{ href: "/compliance", label: "EHDS Compliance" }}
        infoText="EEHRxF defines 10 priority categories of electronic health data that must be interoperable across EU member states. Each profile is matched against FHIR resources in your graph to show alignment status."
        docLink={{
          href: "https://digital-strategy.ec.europa.eu/en/library/recommendation-european-electronic-health-record-exchange-format",
          label: "EEHRxF Recommendation C(2019)800",
          external: true,
        }}
      />

      {error && (
        <div className="mb-6 p-3 rounded bg-red-900/20 border border-red-700 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-1">
          <Layers size={16} className="text-layer2" />
          <span className="text-2xl font-bold">
            {loading ? "—" : data?.summary.totalCategories ?? 0}
          </span>
          <span className="text-xs text-gray-500">Priority Categories</span>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-1">
          <ShieldCheck size={16} className="text-layer3" />
          <span className="text-2xl font-bold">
            {loading ? "—" : data?.summary.totalProfiles ?? 0}
          </span>
          <span className="text-xs text-gray-500">EU Profiles Tracked</span>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-1">
          <CheckCircle size={16} className="text-green-400" />
          <span className="text-2xl font-bold">
            {loading ? "—" : data?.summary.coveredProfiles ?? 0}
          </span>
          <span className="text-xs text-gray-500">Profiles with Data</span>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-1">
          <AlertTriangle size={16} className="text-yellow-400" />
          <span className="text-2xl font-bold">
            {loading ? "—" : `${data?.summary.coveragePercent ?? 0}%`}
          </span>
          <span className="text-xs text-gray-500">Overall Coverage</span>
        </div>
      </div>

      {/* EHDS Timeline */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-gray-400" />
          <h2 className="font-semibold text-sm text-gray-200">
            EHDS Implementation Timeline
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
                      : "bg-gray-900 border-gray-600"
                  }`}
                />
                <span
                  className={`text-xs font-medium mt-1 ${
                    m.active ? "text-layer2" : "text-gray-400"
                  }`}
                >
                  {m.year}
                </span>
                <span className="text-[10px] text-gray-500 text-center max-w-[100px] leading-tight mt-0.5">
                  {m.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category cards */}
      {loading ? (
        <div className="text-gray-500 text-sm">Loading EEHRxF profiles…</div>
      ) : (
        <div className="flex flex-col gap-4">
          {data?.categories.map((cat) => (
            <CategoryCard key={cat.categoryId} category={cat} />
          ))}
        </div>
      )}

      {/* Reference links */}
      <div className="mt-10 border-t border-gray-800 pt-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">References</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {[
            {
              label: "EHDS Regulation (EU)",
              url: "https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en",
            },
            {
              label: "EEHRxF Recommendation C(2019)800",
              url: "https://digital-strategy.ec.europa.eu/en/library/recommendation-european-electronic-health-record-exchange-format",
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
              label: "Xt-EHR Joint Action",
              url: "https://www.xt-ehr.eu/",
            },
          ].map((ref) => (
            <a
              key={ref.url}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-layer2 transition-colors"
            >
              <ExternalLink size={12} />
              {ref.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
