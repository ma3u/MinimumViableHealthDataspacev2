"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Pill,
  FlaskConical,
  Users,
  Calendar,
  BarChart2,
} from "lucide-react";

interface AnalyticsData {
  summary: {
    persons: number;
    conditions: number;
    drugs: number;
    measurements: number;
    visits: number;
  };
  topConditions: { label: string; count: number }[];
  topDrugs: { label: string; count: number }[];
  topMeasurements: { label: string; count: number }[];
  genderBreakdown: { gender: string; count: number }[];
}

const LAYER_COLORS = {
  condition: "bg-layer3",
  drug: "bg-layer4",
  measurement: "bg-layer5",
  neutral: "bg-layer2",
};

function HorizontalBar({
  label,
  count,
  maxCount,
  colorClass,
}: {
  label: string;
  count: number;
  maxCount: number;
  colorClass: string;
}) {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  const shortLabel = label.length > 55 ? label.slice(0, 52) + "…" : label;
  return (
    <div className="flex items-center gap-3 py-1">
      <span
        className="text-xs text-gray-400 text-right shrink-0"
        style={{ width: "260px", minWidth: "260px" }}
        title={label}
      >
        {shortLabel}
      </span>
      <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
        <div
          className={`${colorClass} h-4 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-300 shrink-0 w-12 text-right">
        {count.toLocaleString()}
      </span>
    </div>
  );
}

function BarSection({
  title,
  icon: Icon,
  data,
  colorClass,
  loading,
}: {
  title: string;
  icon: React.ElementType;
  data: { label: string; count: number }[];
  colorClass: string;
  loading: boolean;
}) {
  const maxCount = data[0]?.count ?? 1;
  return (
    <section className="bg-gray-900 border border-gray-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-gray-400" />
        <h2 className="font-semibold text-sm text-gray-200">{title}</h2>
      </div>
      {loading ? (
        <div className="text-gray-500 text-xs">Loading…</div>
      ) : data.length === 0 ? (
        <div className="text-gray-500 text-xs">No data</div>
      ) : (
        <div className="flex flex-col gap-1">
          {data.map((d, i) => (
            <HorizontalBar
              key={i}
              label={d.label}
              count={d.count}
              maxCount={maxCount}
              colorClass={colorClass}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
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

  const summary = data?.summary;

  const statCards = [
    {
      label: "Patients",
      value: summary?.persons,
      icon: Users,
      color: "text-layer1",
    },
    {
      label: "Conditions",
      value: summary?.conditions,
      icon: Activity,
      color: "text-layer3",
    },
    {
      label: "Drug Exposures",
      value: summary?.drugs,
      icon: Pill,
      color: "text-layer4",
    },
    {
      label: "Measurements",
      value: summary?.measurements,
      icon: FlaskConical,
      color: "text-layer5",
    },
    {
      label: "Visits",
      value: summary?.visits,
      icon: Calendar,
      color: "text-layer2",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 mb-1">
        <BarChart2 size={20} className="text-layer4" />
        <h1 className="text-2xl font-bold">OMOP Research Analytics</h1>
      </div>
      <p className="text-gray-400 text-sm mb-8">
        Layer 4 — OMOP CDM cohort statistics from 127-patient Synthea dataset
        (EHDS Art. 53 secondary use)
      </p>

      {error && (
        <div className="mb-6 p-3 rounded bg-red-900/20 border border-red-700 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-1"
          >
            <Icon size={16} className={color} />
            <span className="text-2xl font-bold">
              {loading ? "—" : (value ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Gender breakdown */}
      {!loading && data?.genderBreakdown && (
        <div className="mb-8 bg-gray-900 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-gray-400" />
            <h2 className="font-semibold text-sm text-gray-200">
              Gender Distribution
            </h2>
          </div>
          <div className="flex gap-6">
            {data.genderBreakdown.map((g) => {
              const total = data.genderBreakdown.reduce(
                (s, x) => s + x.count,
                0,
              );
              const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
              return (
                <div key={g.gender} className="flex items-center gap-2 text-sm">
                  <span
                    className={`inline-block w-3 h-3 rounded-full ${
                      g.gender === "Female" ? "bg-layer3" : "bg-layer4"
                    }`}
                  />
                  <span className="text-gray-300">{g.gender}</span>
                  <span className="text-gray-400">
                    {g.count.toLocaleString()} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bar chart sections */}
      <div className="flex flex-col gap-6">
        <BarSection
          title="Top Conditions (OMOPConditionOccurrence)"
          icon={Activity}
          data={data?.topConditions ?? []}
          colorClass={LAYER_COLORS.condition}
          loading={loading}
        />
        <BarSection
          title="Top Drug Exposures (OMOPDrugExposure)"
          icon={Pill}
          data={data?.topDrugs ?? []}
          colorClass={LAYER_COLORS.drug}
          loading={loading}
        />
        <BarSection
          title="Top Measurements (OMOPMeasurement)"
          icon={FlaskConical}
          data={data?.topMeasurements ?? []}
          colorClass={LAYER_COLORS.measurement}
          loading={loading}
        />
      </div>
    </div>
  );
}
