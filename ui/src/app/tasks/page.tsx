"use client";

import { fetchApi } from "@/lib/api";
import { DEMO_PERSONAS } from "@/lib/auth";
import { useDemoPersona } from "@/lib/use-demo-persona";
import { useTabSession } from "@/lib/use-tab-session";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  FileSignature,
  Filter,
  Key,
  Loader2,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import Link from "next/link";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

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
    return "text-[var(--success-text)]";
  if (s.includes("TERMINATED") || s.includes("ERROR"))
    return "text-[var(--danger-text)]";
  if (s.includes("STARTED") || s.includes("AGREED") || s.includes("VERIFIED"))
    return "text-[var(--accent)]";
  if (s.includes("SUSPENDED")) return "text-orange-800 dark:text-orange-400";
  return "text-[var(--warning-text)]";
}

function stateBg(state: string): string {
  const s = state?.toUpperCase() || "";
  if (s.includes("FINALIZED") || s.includes("COMPLETED"))
    return "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border border-[var(--badge-active-border)]";
  if (s.includes("TERMINATED") || s.includes("ERROR"))
    return "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border border-[var(--badge-inactive-border)]";
  if (s.includes("STARTED") || s.includes("AGREED") || s.includes("VERIFIED"))
    return "bg-[var(--accent)]/10 text-[var(--accent)]";
  if (s.includes("SUSPENDED"))
    return "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-400";
  return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-400";
}

/** Determine index in a state array, -1 for terminated/error */
function stateIndex(state: string, states: readonly string[]): number {
  const s = state?.toUpperCase() || "";
  if (s.includes("TERMINATED") || s.includes("ERROR")) return -1;
  return states.findIndex((ds) => s.includes(ds));
}

/* ── DSP State Machine Actions ── */

/**
 * Available actions per DSP state — maps current state to the next valid
 * transition(s) a participant can invoke.
 *
 * See IDS Dataspace Protocol 2025-1:
 *   Negotiations: Consumer/Provider interaction protocol
 *   Transfers:    Data Plane Signaling (DPS) lifecycle
 */
const NEGOTIATION_ACTIONS: Record<string, { label: string; color: string }[]> =
  {
    REQUESTED: [{ label: "Offer", color: "text-[var(--accent)]" }],
    OFFERED: [{ label: "Accept", color: "text-[var(--accent)]" }],
    ACCEPTED: [{ label: "Agree", color: "text-[var(--accent)]" }],
    AGREED: [{ label: "Verify", color: "text-[var(--accent)]" }],
    VERIFIED: [{ label: "Finalize", color: "text-[var(--success-text)]" }],
    FINALIZED: [],
  };

const TRANSFER_ACTIONS: Record<string, { label: string; color: string }[]> = {
  REQUESTED: [{ label: "Start", color: "text-[var(--accent)]" }],
  STARTED: [
    { label: "Suspend", color: "text-orange-800 dark:text-orange-400" },
    { label: "Complete", color: "text-[var(--success-text)]" },
  ],
  SUSPENDED: [{ label: "Resume", color: "text-[var(--accent)]" }],
  COMPLETED: [],
};

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
        let color = "text-[var(--text-secondary)]";

        if (isTerminated && i === 0) {
          icon = <XCircle size={12} className="text-[var(--danger-text)]" />;
          color = "text-[var(--danger-text)]";
        } else if (isPast) {
          icon = (
            <CheckCircle2 size={12} className="text-[var(--success-text)]" />
          );
          color = "text-[var(--success-text)]";
        } else if (isActive) {
          const isEndState = step === "FINALIZED" || step === "COMPLETED";
          if (isEndState) {
            icon = (
              <CheckCircle2 size={12} className="text-[var(--success-text)]" />
            );
            color = "text-[var(--success-text)]";
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
          icon = <Circle size={12} className="text-[var(--text-secondary)]" />;
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
          <XCircle size={12} className="text-[var(--danger-text)]" />
          <span className="text-[9px] text-[var(--danger-text)] leading-none">
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
        <div className="flex items-center gap-2 text-[var(--text-secondary)] p-10">
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
  /* ── Current user context ── */
  const demoPersona = useDemoPersona();
  const { session: tabSession } = useTabSession();

  const currentRoles: string[] = IS_STATIC
    ? demoPersona
      ? [...demoPersona.roles]
      : []
    : tabSession?.roles ?? [];
  const currentUsername: string = IS_STATIC
    ? demoPersona?.username ?? ""
    : tabSession?.username ?? "";

  // Resolve the user's organisation name (matches task.participant)
  const currentOrg = useMemo(() => {
    const persona = DEMO_PERSONAS.find((p) => p.username === currentUsername);
    return persona?.organisation ?? "";
  }, [currentUsername]);

  // Admin and HDAB can see all tasks; everyone else only sees their own
  const isAdmin =
    currentRoles.includes("EDC_ADMIN") ||
    currentRoles.includes("HDAB_AUTHORITY");

  const [data, setData] = useState<TasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedParticipant, setSelectedParticipant] = useState<string>("all");
  const [participantDropdownOpen, setParticipantDropdownOpen] = useState(false);

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

  const allTasks = data?.tasks || [];

  // Scope: non-admin users only see tasks where participant matches their org
  // or where they are the counterParty
  const tasks = useMemo(() => {
    if (isAdmin) return allTasks;
    if (!currentOrg) return allTasks;
    return allTasks.filter(
      (t) => t.participant === currentOrg || t.counterParty === currentOrg,
    );
  }, [allTasks, isAdmin, currentOrg]);

  const counts = data?.counts || {
    total: 0,
    negotiations: 0,
    transfers: 0,
    active: 0,
  };

  // Unique participants for the filter dropdown (admin only)
  const uniqueParticipants = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => map.set(t.participantId, t.participant));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const filteredTasks = tasks.filter((t) => {
    // Participant filter (admin only)
    if (
      isAdmin &&
      selectedParticipant !== "all" &&
      t.participantId !== selectedParticipant
    )
      return false;
    // Type/status filter
    if (filter === "all") return true;
    if (filter === "negotiation") return t.type === "negotiation";
    if (filter === "transfer") return t.type === "transfer";
    if (filter === "active")
      return !["FINALIZED", "COMPLETED", "TERMINATED", "ERROR"].includes(
        t.state?.toUpperCase() || "",
      );
    return true;
  });

  // Recompute counts after participant filter
  const filteredCounts = useMemo(() => {
    const pTasks =
      isAdmin && selectedParticipant !== "all"
        ? tasks.filter((t) => t.participantId === selectedParticipant)
        : tasks;
    return {
      total: pTasks.length,
      negotiations: pTasks.filter((t) => t.type === "negotiation").length,
      transfers: pTasks.filter((t) => t.type === "transfer").length,
      active: pTasks.filter(
        (t) =>
          !["FINALIZED", "COMPLETED", "TERMINATED", "ERROR"].includes(
            t.state?.toUpperCase() || "",
          ),
      ).length,
    };
  }, [tasks, isAdmin, selectedParticipant]);

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: "all", label: "All", count: filteredCounts.total },
    { key: "active", label: "Active", count: filteredCounts.active },
    {
      key: "negotiation",
      label: "Negotiations",
      count: filteredCounts.negotiations,
    },
    { key: "transfer", label: "Transfers", count: filteredCounts.transfers },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <PageIntro
          title={isAdmin ? "All Tasks" : "My Tasks"}
          icon={ClipboardList}
          description={
            isAdmin
              ? "Track all DSP protocol tasks across your dataspace participants. Negotiations and transfers are shown as live state pipelines following the Dataspace Protocol and Data Plane Signaling (DPS) specification."
              : `Negotiations and transfers for ${
                  currentOrg || "your organisation"
                }. Use action buttons to advance the DSP state machine.`
          }
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
              value: filteredCounts.total,
              color: "text-[var(--text-primary)]",
            },
            {
              label: "Active",
              value: filteredCounts.active,
              color: "text-[var(--warning-text)]",
            },
            {
              label: "Negotiations",
              value: filteredCounts.negotiations,
              color: "text-[var(--accent)]",
            },
            {
              label: "Transfers",
              value: filteredCounts.transfers,
              color: "text-[var(--accent)]",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50"
            >
              <p className="text-xs text-[var(--text-secondary)]">
                {card.label}
              </p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Participant filter + Type filter tabs + Refresh */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Participant dropdown — admin / HDAB only */}
            {isAdmin && (
              <div className="relative">
                <button
                  onClick={() =>
                    setParticipantDropdownOpen(!participantDropdownOpen)
                  }
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-colors ${
                    selectedParticipant !== "all"
                      ? "border-layer2 bg-layer2/20 text-teal-800 dark:text-teal-300"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-gray-500"
                  }`}
                >
                  <Users size={12} />
                  {selectedParticipant === "all"
                    ? "All Participants"
                    : uniqueParticipants.find(
                        ([id]) => id === selectedParticipant,
                      )?.[1] || "Unknown"}
                  <ChevronDown size={10} />
                </button>
                {participantDropdownOpen && (
                  <div className="absolute z-20 mt-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-xl py-1 min-w-[200px]">
                    <button
                      onClick={() => {
                        setSelectedParticipant("all");
                        setParticipantDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] ${
                        selectedParticipant === "all"
                          ? "text-teal-800 dark:text-teal-300"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      All Participants ({counts.total})
                    </button>
                    {uniqueParticipants.map(([id, name]) => {
                      const pCount = tasks.filter(
                        (t) => t.participantId === id,
                      ).length;
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            setSelectedParticipant(id);
                            setParticipantDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] ${
                            selectedParticipant === id
                              ? "text-teal-800 dark:text-teal-300"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {name}{" "}
                          <span className="text-[var(--text-secondary)]">
                            ({pCount})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Type/status filter tabs */}
            <div className="flex items-center gap-1">
              <Filter size={14} className="text-[var(--text-secondary)] mr-1" />
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    filter === f.key
                      ? "border-layer2 bg-layer2/20 text-teal-800 dark:text-teal-300"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-gray-500"
                  }`}
                >
                  {f.label}
                  <span className="ml-1 text-[var(--text-secondary)]">
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => loadTasks(true)}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Task List */}
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)] py-8">
            <Loader2 size={16} className="animate-spin" />
            Loading tasks…
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">
            <ClipboardList size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {filter === "all"
                ? "No tasks yet. Start by sharing data or negotiating a contract."
                : `No ${filter} tasks found.`}
            </p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <Link
                href="/data/share"
                className="text-xs text-teal-800 dark:text-teal-300 hover:underline"
              >
                Share Data →
              </Link>
              <Link
                href="/negotiate"
                className="text-xs text-teal-800 dark:text-teal-300 hover:underline"
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
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300";

              // Link to the detail page
              const detailHref = isNeg
                ? `/negotiate?participantId=${task.participantId}`
                : `/data/transfer?participantId=${task.participantId}`;

              return (
                <Link
                  key={`${task.type}-${task.id}`}
                  href={detailHref}
                  className="block p-4 border border-[var(--border)] rounded-xl hover:border-gray-500 transition-colors space-y-3"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <TypeIcon size={14} className={stateColor(task.state)} />
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {task.asset}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${typeBadgeColor} shrink-0`}
                      >
                        {typeBadge}
                      </span>
                      {task.transferType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 shrink-0">
                          {task.transferType}
                        </span>
                      )}
                      {/* DPS: EDR availability indicator — shows when Data Plane
                        has been signalled and generated an Endpoint Data Reference */}
                      {task.edrAvailable && (
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] shrink-0">
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

                  {/* DSP Actions — available state transitions */}
                  {(() => {
                    const actions = isNeg
                      ? NEGOTIATION_ACTIONS[task.state]
                      : TRANSFER_ACTIONS[task.state];
                    if (!actions || actions.length === 0) return null;
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          Actions:
                        </span>
                        {actions.map((action) => (
                          <span
                            key={action.label}
                            className={`text-[10px] px-2 py-0.5 rounded-full bg-layer2/10 border border-layer2/30 ${action.color}`}
                          >
                            {action.label}
                          </span>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Metadata row */}
                  <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)] flex-wrap">
                    <span>
                      {task.participant}
                      {task.counterParty !== "—" && ` → ${task.counterParty}`}
                    </span>
                    {task.contractId && (
                      <span
                        className="text-[var(--text-secondary)]"
                        title="Contract Agreement ID"
                      >
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
                    <span className="text-[var(--text-secondary)]">
                      {task.id.slice(0, 8)}…
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
