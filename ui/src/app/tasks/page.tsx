"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileSignature,
  Filter,
  Key,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import Link from "next/link";

/* ── Types ── */

interface Task {
  id: string;
  type: "negotiation" | "transfer";
  participant: string;
  participantId: string;
  asset: string;
  assetId: string;
  state: string;
  counterParty: string;
  timestamp: number;
  contractId?: string;
  transferType?: string;
  edrAvailable?: boolean; // DPS: Endpoint Data Reference available (Data Plane signalled)
}

interface TasksResponse {
  tasks: Task[];
  counts: {
    total: number;
    negotiations: number;
    transfers: number;
    active: number;
  };
}

/* ── DSP State helpers ── */

/**
 * DSP Contract Negotiation state machine (IDS Dataspace Protocol 2025-1):
 * REQUESTED → OFFERED → ACCEPTED → AGREED → VERIFIED → FINALIZED
 * (TERMINATED can occur at any point)
 */
const NEGOTIATION_STATES = [
  "REQUESTED",
  "OFFERED",
  "ACCEPTED",
  "AGREED",
  "VERIFIED",
  "FINALIZED",
] as const;

/**
 * DSP Transfer Process state machine (IDS Dataspace Protocol 2025-1):
 * REQUESTED → STARTED → SUSPENDED → COMPLETED
 * (TERMINATED can occur at any point)
 *
 * DPS (Data Plane Signaling): When STARTED, the Control Plane signals
 * the Data Plane via /api/control/v1/dataflows. The Data Plane generates
 * an Endpoint Data Reference (EDR) with JWT bearer token for data access.
 */
const TRANSFER_STATES = [
  "REQUESTED",
  "STARTED",
  "SUSPENDED",
  "COMPLETED",
] as const;

function stateColor(state: string): string {
  const s = state?.toUpperCase() || "";
  if (s.includes("FINALIZED") || s.includes("COMPLETED"))
    return "text-green-400";
  if (s.includes("TERMINATED") || s.includes("ERROR")) return "text-red-400";
  if (s.includes("STARTED") || s.includes("AGREED") || s.includes("VERIFIED"))
    return "text-blue-400";
  if (s.includes("SUSPENDED")) return "text-orange-400";
  return "text-yellow-400";
}

function stateBg(state: string): string {
  const s = state?.toUpperCase() || "";
  if (s.includes("FINALIZED") || s.includes("COMPLETED"))
    return "bg-green-900/40 text-green-400";
  if (s.includes("TERMINATED") || s.includes("ERROR"))
    return "bg-red-900/40 text-red-400";
  if (s.includes("STARTED") || s.includes("AGREED") || s.includes("VERIFIED"))
    return "bg-blue-900/40 text-blue-400";
  if (s.includes("SUSPENDED")) return "bg-orange-900/40 text-orange-400";
  return "bg-yellow-900/40 text-yellow-400";
}

/** Determine index in a state array, -1 for terminated/error */
function stateIndex(state: string, states: readonly string[]): number {
  const s = state?.toUpperCase() || "";
  if (s.includes("TERMINATED") || s.includes("ERROR")) return -1;
  return states.findIndex((ds) => s.includes(ds));
}

/* ── Pipeline Stepper Component ── */

function StatePipeline({
  state,
  states,
}: {
  state: string;
  states: readonly string[];
}) {
  const current = stateIndex(state, states);
  const isTerminated =
    state?.toUpperCase().includes("TERMINATED") ||
    state?.toUpperCase().includes("ERROR");

  return (
    <div className="flex items-center gap-0.5 w-full">
      {states.map((step, i) => {
        const isActive = i === current;
        const isPast = current >= 0 && i < current;

        let icon;
        let color = "text-gray-600";

        if (isTerminated && i === 0) {
          icon = <XCircle size={12} className="text-red-400" />;
          color = "text-red-400";
        } else if (isPast) {
          icon = <CheckCircle2 size={12} className="text-green-400" />;
          color = "text-green-400";
        } else if (isActive) {
          const isEndState = step === "FINALIZED" || step === "COMPLETED";
          if (isEndState) {
            icon = <CheckCircle2 size={12} className="text-green-400" />;
            color = "text-green-400";
          } else {
            icon = (
              <div className="relative">
                <Circle size={12} className={stateColor(state)} />
                <div
                  className={`absolute inset-0 animate-ping rounded-full ${stateColor(
                    state,
                  )} opacity-30`}
                  style={{ width: 12, height: 12 }}
                />
              </div>
            );
            color = stateColor(state);
          }
        } else {
          icon = <Circle size={12} className="text-gray-600" />;
        }

        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5">
              {icon}
              <span
                className={`text-[9px] ${color} whitespace-nowrap leading-none`}
              >
                {step}
              </span>
            </div>
            {i < states.length - 1 && (
              <div
                className={`flex-1 h-px mx-0.5 ${
                  isPast ? "bg-green-700" : "bg-gray-700"
                }`}
              />
            )}
          </div>
        );
      })}
      {isTerminated && (
        <div className="flex flex-col items-center gap-0.5 ml-1">
          <XCircle size={12} className="text-red-400" />
          <span className="text-[9px] text-red-400 leading-none">
            TERMINATED
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Filter Tabs ── */

type FilterType = "all" | "negotiation" | "transfer" | "active";

/* ── Main Page ── */

export default function TasksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-gray-500 p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <TasksContent />
    </Suspense>
  );
}

function TasksContent() {
  const [data, setData] = useState<TasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  const loadTasks = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetchApi("/api/tasks");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(() => loadTasks(true), 15000);
    return () => clearInterval(interval);
  }, []);

  const tasks = data?.tasks || [];
  const counts = data?.counts || {
    total: 0,
    negotiations: 0,
    transfers: 0,
    active: 0,
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "negotiation") return t.type === "negotiation";
    if (filter === "transfer") return t.type === "transfer";
    if (filter === "active")
      return !["FINALIZED", "COMPLETED", "TERMINATED", "ERROR"].includes(
        t.state?.toUpperCase() || "",
      );
    return true;
  });

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "active", label: "Active", count: counts.active },
    { key: "negotiation", label: "Negotiations", count: counts.negotiations },
    { key: "transfer", label: "Transfers", count: counts.transfers },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Tasks"
        icon={ClipboardList}
        description="Track all DSP protocol tasks across your dataspace participants. Negotiations and transfers are shown as live state pipelines following the Dataspace Protocol and Data Plane Signaling (DPS) specification."
        infoText="Tasks are aggregated from all registered participant contexts. Negotiations follow: REQUESTED → OFFERED → ACCEPTED → AGREED → VERIFIED → FINALIZED. Transfers follow: REQUESTED → STARTED → SUSPENDED → COMPLETED. The EDR badge indicates the Data Plane has been signalled via DPS and generated an Endpoint Data Reference with JWT bearer token."
        docLink={{
          href: "https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol",
          label: "DSP Specification",
          external: true,
        }}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "Total Tasks",
            value: counts.total,
            color: "text-gray-200",
          },
          {
            label: "Active",
            value: counts.active,
            color: "text-yellow-400",
          },
          {
            label: "Negotiations",
            value: counts.negotiations,
            color: "text-blue-400",
          },
          {
            label: "Transfers",
            value: counts.transfers,
            color: "text-purple-400",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="p-3 rounded-xl border border-gray-700 bg-gray-800/50"
          >
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs + Refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <Filter size={14} className="text-gray-500 mr-1" />
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filter === f.key
                  ? "border-layer2 bg-layer2/20 text-layer2"
                  : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
              }`}
            >
              {f.label}
              <span className="ml-1 opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => loadTasks(true)}
          disabled={refreshing}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8">
          <Loader2 size={16} className="animate-spin" />
          Loading tasks…
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ClipboardList size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {filter === "all"
              ? "No tasks yet. Start by sharing data or negotiating a contract."
              : `No ${filter} tasks found.`}
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Link
              href="/data/share"
              className="text-xs text-layer2 hover:underline"
            >
              Share Data →
            </Link>
            <Link
              href="/negotiate"
              className="text-xs text-layer2 hover:underline"
            >
              Negotiate →
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredTasks.map((task) => {
            const isNeg = task.type === "negotiation";
            const states = isNeg ? NEGOTIATION_STATES : TRANSFER_STATES;
            const TypeIcon = isNeg ? FileSignature : ArrowRightLeft;
            const typeBadge = isNeg ? "Negotiation" : "Transfer";
            const typeBadgeColor = isNeg
              ? "bg-blue-900/40 text-blue-400"
              : "bg-purple-900/40 text-purple-400";

            // Link to the detail page
            const detailHref = isNeg
              ? `/negotiate?participantId=${task.participantId}`
              : `/data/transfer?participantId=${task.participantId}`;

            return (
              <Link
                key={`${task.type}-${task.id}`}
                href={detailHref}
                className="block p-4 border border-gray-700 rounded-xl hover:border-gray-500 transition-colors space-y-3"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <TypeIcon size={14} className={stateColor(task.state)} />
                    <span className="text-sm font-medium text-gray-200 truncate">
                      {task.asset}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${typeBadgeColor} shrink-0`}
                    >
                      {typeBadge}
                    </span>
                    {task.transferType && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 shrink-0">
                        {task.transferType}
                      </span>
                    )}
                    {/* DPS: EDR availability indicator — shows when Data Plane
                        has been signalled and generated an Endpoint Data Reference */}
                    {task.edrAvailable && (
                      <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 shrink-0">
                        <Key size={9} />
                        EDR
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${stateBg(
                      task.state,
                    )}`}
                  >
                    {task.state || "UNKNOWN"}
                  </span>
                </div>

                {/* Pipeline */}
                <StatePipeline state={task.state} states={states} />

                {/* Metadata row */}
                <div className="flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
                  <span>
                    {task.participant}
                    {task.counterParty !== "—" && ` → ${task.counterParty}`}
                  </span>
                  {task.contractId && (
                    <span className="opacity-60" title="Contract Agreement ID">
                      📄 {task.contractId.slice(0, 12)}…
                    </span>
                  )}
                  {task.timestamp > 0 && (
                    <span>
                      {new Date(task.timestamp).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                  <span className="opacity-60">{task.id.slice(0, 8)}…</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
