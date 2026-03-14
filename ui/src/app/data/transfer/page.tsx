"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

/* ── Types ── */

interface Transfer {
  "@id": string;
  state?: string;
  "edc:state"?: string;
  type?: string;
  "edc:type"?: string;
  stateTimestamp?: number;
  "edc:stateTimestamp"?: number;
  contractId?: string;
  "edc:contractId"?: string;
  transferType?: string;
  assetId?: string;
  [key: string]: unknown;
}

interface Agreement {
  "@id": string;
  assetId?: string;
  "edc:assetId"?: string;
  counterPartyId?: string;
  counterPartyAddress?: string;
  [key: string]: unknown;
}

interface ParticipantCtx {
  "@id": string;
  identity: string;
  displayName?: string;
  role?: string;
}

/* ── Helpers ── */

/** Read a transfer/agreement field that may be edc:-prefixed or unprefixed */
function f(obj: Record<string, unknown>, field: string): string {
  return (obj[field] ?? obj[`edc:${field}`] ?? "") as string;
}

/** Resolve a DID to a short human-readable name */
function didToName(did: string): string {
  const slug = decodeURIComponent(did).split(":").pop()?.toLowerCase() ?? "";
  const names: Record<string, string> = {
    "alpha-klinik": "AlphaKlinik Berlin",
    pharmaco: "PharmaCo Research AG",
    medreg: "MedReg DE",
    lmc: "Limburg Medical Centre",
    irs: "Institut de Recherche Santé",
  };
  return names[slug] || slug || did.slice(0, 16);
}

/** Pretty-print an asset ID as a title */
function assetLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayParticipant(p: ParticipantCtx): string {
  if (p.displayName) return p.displayName;
  return didToName(p.identity || p["@id"]);
}

/**
 * DSP Transfer Process state machine (Signalling Protocol).
 * @see https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol/transfer-process
 *
 * Consumer states: REQUESTED → STARTED → SUSPENDED → COMPLETED | TERMINATED
 */
const DSP_STATES = ["REQUESTED", "STARTED", "SUSPENDED", "COMPLETED"] as const;

type DspState = (typeof DSP_STATES)[number] | "TERMINATED" | string;

function stateIndex(state: DspState): number {
  const s = state?.toUpperCase() || "";
  if (s.includes("TERMINATED")) return -1; // error path
  const idx = DSP_STATES.findIndex((ds) => s.includes(ds));
  return idx;
}

function stateColor(state: DspState) {
  const s = state?.toUpperCase() || "";
  if (s.includes("COMPLETED")) return "text-green-400";
  if (s.includes("TERMINATED") || s.includes("ERROR")) return "text-red-400";
  if (s.includes("STARTED")) return "text-blue-400";
  if (s.includes("SUSPENDED")) return "text-orange-400";
  return "text-yellow-400";
}

function stateBg(state: DspState) {
  const s = state?.toUpperCase() || "";
  if (s.includes("COMPLETED")) return "bg-green-900/40 text-green-400";
  if (s.includes("TERMINATED") || s.includes("ERROR"))
    return "bg-red-900/40 text-red-400";
  if (s.includes("STARTED")) return "bg-blue-900/40 text-blue-400";
  if (s.includes("SUSPENDED")) return "bg-orange-900/40 text-orange-400";
  return "bg-yellow-900/40 text-yellow-400";
}

/* ── DSP Pipeline Stepper ── */

function DspPipeline({ state }: { state: DspState }) {
  const current = stateIndex(state);
  const isTerminated =
    state?.toUpperCase().includes("TERMINATED") ||
    state?.toUpperCase().includes("ERROR");

  return (
    <div className="flex items-center gap-0.5 w-full">
      {DSP_STATES.map((step, i) => {
        const isActive = i === current;
        const isPast = current >= 0 && i < current;
        const isFuture = current >= 0 && i > current;

        let icon;
        let color = "text-gray-600";
        if (isTerminated && i === 0) {
          // Show error on first uncompleted step
          icon = <XCircle size={14} className="text-red-400" />;
          color = "text-red-400";
        } else if (isPast) {
          icon = <CheckCircle2 size={14} className="text-green-400" />;
          color = "text-green-400";
        } else if (isActive) {
          if (step === "COMPLETED") {
            icon = <CheckCircle2 size={14} className="text-green-400" />;
            color = "text-green-400";
          } else {
            icon = (
              <div className="relative">
                <Circle size={14} className={stateColor(state)} />
                <div
                  className={`absolute inset-0 animate-ping rounded-full ${stateColor(
                    state,
                  )} opacity-30`}
                  style={{ width: 14, height: 14 }}
                />
              </div>
            );
            color = stateColor(state);
          }
        } else if (isFuture) {
          icon = <Circle size={14} className="text-gray-600" />;
        } else {
          icon = <Circle size={14} className="text-gray-600" />;
        }

        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5">
              {icon}
              <span className={`text-[10px] ${color} whitespace-nowrap`}>
                {step}
              </span>
            </div>
            {i < DSP_STATES.length - 1 && (
              <div
                className={`flex-1 h-px mx-1 ${
                  isPast ? "bg-green-700" : "bg-gray-700"
                }`}
              />
            )}
          </div>
        );
      })}
      {isTerminated && (
        <div className="flex flex-col items-center gap-0.5 ml-1">
          <XCircle size={14} className="text-red-400" />
          <span className="text-[10px] text-red-400">TERMINATED</span>
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */

export default function DataTransferPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-gray-500 p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <DataTransferContent />
    </Suspense>
  );
}

function DataTransferContent() {
  const searchParams = useSearchParams();
  const preselectedCtx = searchParams.get("participantId") || "";
  const preContractId = searchParams.get("contractId") || "";

  const [participants, setParticipants] = useState<ParticipantCtx[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCtx, setSelectedCtx] = useState(preselectedCtx);

  // Initiate form
  const [initiating, setInitiating] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(preContractId);
  const [result, setResult] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchApi("/api/participants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list: ParticipantCtx[] = Array.isArray(d)
          ? d
          : d.participants || [];
        setParticipants(list);
        if (!selectedCtx && list.length > 0) {
          setSelectedCtx(list[0]["@id"]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load transfers + agreements when participant changes
  useEffect(() => {
    if (!selectedCtx) return;
    setLoading(true);
    Promise.all([
      fetchApi(`/api/transfers?participantId=${selectedCtx}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? d : d.transfers || []))
        .catch(() => []),
      fetchApi(`/api/negotiations?participantId=${selectedCtx}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          const negs = Array.isArray(d) ? d : d.negotiations || [];
          // Extract agreements from FINALIZED negotiations
          return negs
            .filter(
              (n: Record<string, unknown>) =>
                f(n, "state") === "FINALIZED" && f(n, "contractAgreementId"),
            )
            .map((n: Record<string, unknown>) => ({
              "@id": f(n, "contractAgreementId"),
              assetId: f(n, "assetId") || n.assetId,
              counterPartyId: f(n, "counterPartyId"),
              counterPartyAddress: f(n, "counterPartyAddress"),
            }));
        })
        .catch(() => []),
    ]).then(([tList, aList]) => {
      setTransfers(tList as Transfer[]);
      setAgreements(aList as Agreement[]);
      setLoading(false);
    });
  }, [selectedCtx]);

  const refreshTransfers = async () => {
    if (!selectedCtx) return;
    setRefreshing(true);
    try {
      const res = await fetchApi(`/api/transfers?participantId=${selectedCtx}`);
      const d = await res.json();
      setTransfers(Array.isArray(d) ? d : d.transfers || []);
    } catch {
      /* ignore */
    }
    setRefreshing(false);
  };

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgreement) return;
    setInitiating(true);
    setResult(null);

    const agr = agreements.find((a) => a["@id"] === selectedAgreement);
    const assetId = agr ? f(agr as Record<string, unknown>, "assetId") : "";
    const counterPartyAddress =
      (agr as Record<string, unknown>)?.counterPartyAddress ||
      "http://controlplane:8082/api/dsp";

    try {
      const res = await fetchApi("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: selectedCtx,
          contractId: selectedAgreement,
          assetId,
          counterPartyAddress,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(`Transfer started for ${assetLabel(assetId || data["@id"])}`);
        await refreshTransfers();
      } else {
        const err = await res.json();
        setResult(`Error: ${err.detail || err.error || "Initiation failed"}`);
      }
    } catch {
      setResult("Error: Failed to initiate transfer");
    } finally {
      setInitiating(false);
    }
  };

  // Check which agreements already have transfers
  const agreementHasTransfer = (agrId: string) =>
    transfers.some(
      (t) => f(t as Record<string, unknown>, "contractId") === agrId,
    );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Data Transfers"
        icon={ArrowRightLeft}
        description="Monitor and initiate EDC-V data transfers via the DSP Transfer Process (Signalling Protocol). Once a contract is agreed, start a transfer to pull FHIR or OMOP data from the provider's data plane."
        prevStep={{ href: "/negotiate", label: "Contract Negotiation" }}
        nextStep={{ href: "/admin", label: "Operator Dashboard" }}
        infoText="The DSP Signalling Protocol defines the transfer state machine: REQUESTED → STARTED → COMPLETED (or TERMINATED on failure). Each transfer is secured by EDC-V access tokens issued during the STARTED phase."
        docLink={{
          href: "https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol/transfer-process",
          label: "DSP Transfer Process Spec",
          external: true,
        }}
      />

      {/* Participant selector */}
      <div className="mb-6">
        <label className="text-xs text-gray-500 mb-1 block">
          Requesting as (your participant)
        </label>
        <select
          value={selectedCtx}
          onChange={(e) => setSelectedCtx(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
        >
          {participants.map((p) => (
            <option key={p["@id"]} value={p["@id"]}>
              {displayParticipant(p)}
              {p.role ? ` [${p.role}]` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* ── Initiate Transfer from Agreement ── */}
      <div className="border border-gray-700 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Play size={16} className="text-layer2" />
          <h2 className="font-semibold text-sm">
            Start Transfer from Agreement
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Select a finalized contract agreement to pull data via{" "}
          <code className="text-gray-400">HttpData-PULL</code>.
        </p>

        {result && (
          <div
            className={`mb-4 p-3 rounded text-sm ${
              result.startsWith("Error")
                ? "bg-red-900/40 border border-red-700 text-red-300"
                : "bg-green-900/40 border border-green-700 text-green-300"
            }`}
          >
            {result}
          </div>
        )}

        {agreements.length === 0 && !loading && (
          <p className="text-xs text-gray-500">
            No finalized agreements found. Complete a{" "}
            <a href="/negotiate" className="text-layer2 hover:underline">
              contract negotiation
            </a>{" "}
            first.
          </p>
        )}

        {agreements.length > 0 && (
          <form onSubmit={handleInitiate} className="space-y-3">
            <div className="space-y-2">
              {agreements.map((agr) => {
                const agrId = agr["@id"];
                const aId = f(agr as Record<string, unknown>, "assetId");
                const cp = f(agr as Record<string, unknown>, "counterPartyId");
                const hasTransfer = agreementHasTransfer(agrId);

                return (
                  <label
                    key={agrId}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedAgreement === agrId
                        ? "border-layer2 bg-layer2/10"
                        : "border-gray-700 hover:border-gray-500 bg-gray-800/50"
                    } ${hasTransfer ? "opacity-60" : ""}`}
                  >
                    <input
                      type="radio"
                      name="agreement"
                      value={agrId}
                      checked={selectedAgreement === agrId}
                      onChange={() => setSelectedAgreement(agrId)}
                      className="accent-layer2"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-200">
                        {aId ? assetLabel(aId as string) : agrId.slice(0, 12)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Provider: {cp ? didToName(cp as string) : "—"}
                        {hasTransfer && (
                          <span className="ml-2 text-yellow-500">
                            (transfer in progress)
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">
                      AGREED
                    </span>
                  </label>
                );
              })}
            </div>
            <button
              type="submit"
              disabled={initiating || !selectedAgreement}
              className="flex items-center gap-2 px-4 py-2 bg-layer2 text-white rounded text-sm font-medium hover:bg-layer2/90 disabled:opacity-50"
            >
              {initiating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRightLeft size={14} />
              )}
              Start Transfer
            </button>
          </form>
        )}
      </div>

      {/* ── Transfer Processes (DSP State Machine) ── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm">
          Transfer Processes{" "}
          <span className="font-normal text-gray-500">
            (DSP Signalling Protocol)
          </span>
        </h2>
        <button
          onClick={refreshTransfers}
          disabled={refreshing}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading transfers…
        </div>
      ) : transfers.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No transfer processes yet. Start one from an agreed contract above.
        </p>
      ) : (
        <div className="grid gap-3">
          {transfers.map((t) => {
            const state = f(t as Record<string, unknown>, "state");
            const aId = t.assetId || f(t as Record<string, unknown>, "assetId");
            const transferType =
              f(t as Record<string, unknown>, "transferType") ||
              "HttpData-PULL";
            const timestamp =
              (t.stateTimestamp as number) ||
              (t["edc:stateTimestamp"] as number) ||
              0;

            return (
              <div
                key={t["@id"]}
                className="p-4 border border-gray-700 rounded-xl space-y-3"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft size={14} className={stateColor(state)} />
                    <span className="text-sm font-medium text-gray-200">
                      {aId ? assetLabel(aId as string) : t["@id"].slice(0, 12)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                      {transferType}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${stateBg(
                      state,
                    )}`}
                  >
                    {state || "UNKNOWN"}
                  </span>
                </div>

                {/* DSP Pipeline visualization */}
                <DspPipeline state={state} />

                {/* Metadata row */}
                <div className="flex items-center gap-4 text-[11px] text-gray-500">
                  {timestamp > 0 && (
                    <span>
                      Updated:{" "}
                      {new Date(timestamp).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                  <span>Process: {t["@id"].slice(0, 8)}…</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
