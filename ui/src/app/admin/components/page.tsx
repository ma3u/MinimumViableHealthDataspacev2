"use client";

import { fetchApi } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, HardDrive, Loader2, RefreshCw, Users } from "lucide-react";
import { AzureCostEstimatorPanel } from "./_components/AzureCostEstimatorPanel";
import { ClusterResourceBanner } from "./_components/ClusterResourceBanner";
import { ComponentRow } from "./_components/ComponentRow";
import { CostEstimatorPanel } from "./_components/CostEstimatorPanel";
import { CriticalBanner } from "./_components/CriticalBanner";
import { ParticipantTopologySection } from "./_components/ParticipantTopologySection";
import { ResourceSummary } from "./_components/ResourceSummary";
import { TopoComponentCard } from "./_components/TopoComponentCard";
import {
  LAYER_META,
  MAX_HISTORY,
  REFRESH_INTERVAL,
  ROLE_COLORS,
} from "./_components/constants";
import type {
  ComponentInfo,
  HistoryEntry,
  PeakEntry,
  Snapshot,
  TopologyData,
  ViewMode,
} from "./_components/types";

export default function AdminComponentsPage() {
  // Layer view state
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const historyRef = useRef<Map<string, HistoryEntry[]>>(new Map());
  const [historyVersion, setHistoryVersion] = useState(0);

  // Topology view state
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const peaksRef = useRef<Map<string, PeakEntry>>(new Map());
  const [_peakV, setPeakV] = useState(0);

  // Shared state
  const [viewMode, setViewMode] = useState<ViewMode>("participant");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        if (viewMode === "layer") {
          const res = await fetchApi("/api/admin/components");
          if (!res.ok) return;
          const data: Snapshot = await res.json();
          setSnapshot(data);

          const now = Date.now();
          for (const comp of data.components) {
            const key = comp.container;
            const entries = historyRef.current.get(key) || [];
            entries.push({ ts: now, cpu: comp.cpu, mem: comp.mem.usedMB });
            while (entries.length > MAX_HISTORY) entries.shift();
            historyRef.current.set(key, entries);
          }
          setHistoryVersion((v) => v + 1);
        } else {
          const res = await fetchApi("/api/admin/components/topology");
          if (!res.ok) return;
          const data: TopologyData = await res.json();
          setTopology(data);

          // Track peak CPU / Memory per container
          const now = Date.now();
          const cutoff = now - 24 * 60 * 60 * 1000;
          const allComps = [
            ...data.participants.flatMap((p) => p.components),
            ...data.infrastructure,
          ];
          for (const c of allComps) {
            const prev = peaksRef.current.get(c.container);
            if (!prev || prev.since < cutoff) {
              peaksRef.current.set(c.container, {
                maxCpu: c.cpu,
                maxMemMB: c.memMB,
                since: now,
              });
            } else {
              prev.maxCpu = Math.max(prev.maxCpu, c.cpu);
              prev.maxMemMB = Math.max(prev.maxMemMB, c.memMB);
            }
          }
          setPeakV((v) => v + 1);
        }
      } catch (err) {
        console.error("Failed to fetch components:", err);
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [viewMode],
  );

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchData]);

  // Layer view helpers
  const grouped = (snapshot?.components || []).reduce(
    (acc, c) => {
      (acc[c.layer] ??= []).push(c);
      return acc;
    },
    {} as Record<string, ComponentInfo[]>,
  );
  const totalServices = snapshot?.components.length || 0;
  const healthyCount =
    snapshot?.components.filter((c) => c.status === "healthy").length || 0;
  const runningCount =
    snapshot?.components.filter((c) => c.status === "running").length || 0;
  const totalCpu = snapshot?.components.reduce((s, c) => s + c.cpu, 0) || 0;
  // Match the per-row display so the user's manual count of visible values
  // adds up to the shown total. Per-row shows "<1" for sub-1 MB (contributes
  // 0) and Math.round(usedMB) otherwise — sum the same quantities.
  const totalMem =
    snapshot?.components.reduce(
      (s, c) => s + (c.mem.usedMB < 1 ? 0 : Math.round(c.mem.usedMB)),
      0,
    ) || 0;

  void historyVersion;

  const timestamp =
    viewMode === "layer" ? snapshot?.timestamp : topology?.timestamp;

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-7xl mx-auto px-8 py-10">
        {/* ── Page header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="page-header">EDC Components</h1>
            <p className="text-(--text-secondary) text-lg mt-1">
              Infrastructure health · CPU &amp; memory per service
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-(--success)/10 text-(--success-text) rounded-full border border-(--success)/20 text-sm font-bold tracking-tight">
            <span className="w-2 h-2 rounded-full bg-(--success) animate-pulse" />
            LIVE MONITORING
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-4 text-xs text-(--text-secondary)">
            {/* View toggle */}
            <div className="flex bg-(--surface) p-1 rounded-xl border border-(--border)">
              <button
                onClick={() => setViewMode("layer")}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  viewMode === "layer"
                    ? "bg-(--surface-card) shadow-xs text-(--accent)"
                    : "text-(--text-secondary) hover:text-(--text-primary)"
                }`}
              >
                Layer View
              </button>
              <button
                onClick={() => setViewMode("participant")}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  viewMode === "participant"
                    ? "bg-(--surface-card) shadow-xs text-(--accent)"
                    : "text-(--text-secondary) hover:text-(--text-primary)"
                }`}
              >
                Participant View
              </button>
            </div>

            {/* Stats summary for layer view */}
            {viewMode === "layer" && snapshot && (
              <>
                <span>{totalServices} services</span>
                <span>·</span>
                <span className="text-(--success-text)">
                  {healthyCount} healthy
                </span>
                <span className="text-(--accent)">{runningCount} running</span>
                <span>·</span>
                <span>
                  <Cpu size={11} className="inline mr-0.5" />
                  {totalCpu.toFixed(1)}% total
                </span>
                <span>·</span>
                <span>
                  <HardDrive size={11} className="inline mr-0.5" />
                  {totalMem > 1024
                    ? `${(totalMem / 1024).toFixed(1)} GB`
                    : `${Math.round(totalMem)} MB`}{" "}
                  total
                </span>
              </>
            )}

            {/* Stats summary for participant view */}
            {viewMode === "participant" && topology && (
              <>
                <span>{topology.summary.totalParticipants} participants</span>
                <span>·</span>
                <span>{topology.summary.totalInfra} infra services</span>
                {topology.summary.degradedParticipants > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-(--danger-text)">
                      {topology.summary.degradedParticipants} degraded
                    </span>
                  </>
                )}
                {topology.metricsShared && (
                  <>
                    <span>·</span>
                    <span
                      className="italic text-(--text-secondary)"
                      title="Participants are logical DIDs on this deployment — they share the same ACA containers. Switch to Layer View for real per-container CPU/MEM from Azure Monitor."
                    >
                      shared infrastructure (see Layer View for metrics)
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-(--text-secondary) cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded-sm border-(--border-ui) bg-(--surface-2) text-teal-800 dark:text-teal-300 focus:ring-layer2 w-3.5 h-3.5"
              />
              Auto-refresh (30s)
            </label>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-(--border) rounded-lg hover:border-layer2 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-(--text-secondary)">
            <Loader2 size={16} className="animate-spin" />
            Loading EDC components…
          </div>
        ) : viewMode === "participant" ? (
          /* ═══════════════════════════════════════════════════════════════
           PARTICIPANT VIEW
           ═══════════════════════════════════════════════════════════════ */
          topology && (
            <>
              {/* Cluster resource banner */}
              {topology.clusterMetrics && (
                <ClusterResourceBanner metrics={topology.clusterMetrics} />
              )}

              {/* Critical banner */}
              <CriticalBanner
                degraded={topology.summary.degradedParticipants}
                total={topology.summary.totalParticipants}
                participants={topology.participants}
              />

              {/* Participant topology sections */}
              <div className="space-y-3 mb-8">
                <h2 className="font-semibold text-sm flex items-center gap-2 text-(--text-primary) mb-3">
                  <Users
                    size={16}
                    className="text-teal-800 dark:text-teal-300"
                  />
                  Dataspace Participants
                  <span className="text-xs font-normal text-(--text-secondary)">
                    ({topology.participants.length})
                  </span>
                </h2>
                {topology.participants.map((p) => (
                  <ParticipantTopologySection
                    key={p.id}
                    participant={p}
                    peaks={peaksRef.current}
                    metricsShared={Boolean(topology.metricsShared)}
                  />
                ))}
              </div>

              {/* Shared infrastructure */}
              {topology.infrastructure.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                    <h2 className="font-semibold text-sm flex items-center gap-2 text-(--text-primary)">
                      <HardDrive size={16} className="text-(--warning-text)" />
                      Shared Infrastructure &amp; CFM
                      <span className="text-xs font-normal text-(--text-secondary)">
                        ({topology.infrastructure.length})
                      </span>
                    </h2>
                    <ResourceSummary
                      components={topology.infrastructure}
                      peaks={peaksRef.current}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {topology.infrastructure.map((c) => (
                      <TopoComponentCard key={c.container} comp={c} />
                    ))}
                  </div>
                </div>
              )}

              {/* Docker unavailable */}
              {!topology.dockerAvailable && (
                <div className="border border-yellow-600/40 bg-yellow-900/20 rounded-xl p-4 text-sm text-(--warning-text)">
                  <strong>Docker socket not available.</strong> CPU and memory
                  metrics require the Docker socket to be mounted.
                </div>
              )}
            </>
          )
        ) : (
          /* ═══════════════════════════════════════════════════════════════
           LAYER VIEW (original)
           ═══════════════════════════════════════════════════════════════ */
          <>
            {/* Participants */}
            {snapshot && snapshot.participants.length > 0 && (
              <div className="mb-8">
                <h2 className="font-semibold text-sm mb-4 flex items-center gap-2 text-(--text-primary)">
                  <Users
                    size={16}
                    className="text-teal-800 dark:text-teal-300"
                  />
                  Dataspace Participants
                  <span className="text-xs font-normal text-(--text-secondary)">
                    ({snapshot.participants.length})
                  </span>
                </h2>
                <div className="overflow-x-auto border border-(--border) rounded-xl">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-(--border) bg-(--surface)/60">
                        <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-48">
                          Participant
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-32">
                          Role
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-(--text-secondary)">
                          DID
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-28">
                          State
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-20 text-center">
                          Profiles
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.participants.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-(--border) hover:bg-(--surface-2)/40 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-sm text-(--text-primary)">
                              {p.displayName}
                            </div>
                            <div className="text-[11px] text-(--text-secondary)">
                              {p.organization}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                ROLE_COLORS[p.role] ||
                                "bg-gray-500/20 text-(--text-secondary)"
                              }`}
                            >
                              {p.role}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-(--text-secondary)">
                            {p.did}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-xs font-medium ${
                                p.state === "CREATED"
                                  ? "text-(--success-text)"
                                  : "text-(--warning-text)"
                              }`}
                            >
                              {p.state}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-(--text-primary) text-center">
                            {p.profileCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Component tables per layer */}
            {["edc-core", "identity", "cfm", "infrastructure"].map((layer) => {
              const items = grouped[layer];
              if (!items || items.length === 0) return null;
              const meta = LAYER_META[layer];
              const LayerIcon = meta.icon;

              return (
                <div key={layer} className="mb-8">
                  <h2 className="font-semibold text-sm mb-3 flex items-center gap-2 text-(--text-primary)">
                    <LayerIcon size={16} className={meta.color} />
                    {meta.label}
                    <span className="text-xs font-normal text-(--text-secondary)">
                      ({items.length})
                    </span>
                  </h2>
                  <div className="overflow-x-auto border border-(--border) rounded-xl">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-(--border) bg-(--surface)/60">
                          <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-48">
                            Component
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-28">
                            Health
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-24">
                            Uptime
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-40">
                            CPU (Last 24h)
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-44">
                            Memory (Last 24h)
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-(--text-secondary) w-16">
                            Mem %
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((comp) => (
                          <ComponentRow
                            key={comp.container}
                            comp={comp}
                            history={
                              historyRef.current.get(comp.container) || []
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Docker unavailable banner — hidden on Azure deployments
                (where Docker socket is genuinely not present and metrics come
                from Azure Monitor instead). */}
            {snapshot &&
              !snapshot.dockerAvailable &&
              snapshot.metricsSource !== "azure-monitor" &&
              snapshot.deploymentTarget !== "azure" && (
                <div className="border border-yellow-600/40 bg-yellow-900/20 rounded-xl p-4 text-sm text-(--warning-text)">
                  <strong>Docker socket not available.</strong> CPU and memory
                  metrics require the Docker socket to be mounted.
                </div>
              )}
          </>
        )}

        {/* Cost estimator — Azure on ACA deployment, StackIT otherwise.
            Azure is detected from EITHER endpoint's deploy-target signal
            (/api/admin/components snapshot OR the topology endpoint's
            metricsShared flag). Layered OR means the Azure panel surfaces
            as soon as any Azure signal is present — e.g. when participant
            topology knows we're on ACA but the snapshot call raced the
            Azure Monitor role binding. */}
        {snapshot?.deploymentTarget === "azure" ||
        snapshot?.metricsSource === "azure-monitor" ||
        topology?.metricsShared === true ? (
          <AzureCostEstimatorPanel
            liveComponents={snapshot?.components ?? []}
            participantCount={
              viewMode === "participant"
                ? topology?.summary.totalParticipants ?? 5
                : snapshot?.participants.length ?? 5
            }
          />
        ) : (
          <CostEstimatorPanel
            participantCount={
              viewMode === "participant"
                ? topology?.summary.totalParticipants ?? 5
                : snapshot?.participants.length ?? 5
            }
          />
        )}

        {/* Timestamp */}
        {timestamp && (
          <p className="text-[10px] text-(--text-secondary) mt-4">
            Last updated: {new Date(timestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
