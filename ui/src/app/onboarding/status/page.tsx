"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface ParticipantContext {
  "@id": string;
  identity: string;
  state: string;
}

const STATUS_STEPS = [
  {
    key: "tenant",
    label: "Tenant Created",
    desc: "Organization registered in CFM",
  },
  {
    key: "participant",
    label: "Participant Context",
    desc: "EDC-V participant context provisioned",
  },
  {
    key: "did",
    label: "DID Provisioned",
    desc: "Decentralized Identifier (did:web) created",
  },
  {
    key: "credential",
    label: "Credentials Issued",
    desc: "Verifiable Credentials available",
  },
  {
    key: "active",
    label: "Active",
    desc: "Ready to participate in the dataspace",
  },
];

function StepIcon({
  status,
}: {
  status: "done" | "current" | "pending" | "error";
}) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={20} className="text-green-400" />;
    case "current":
      return <Clock size={20} className="text-yellow-400 animate-pulse" />;
    case "error":
      return <XCircle size={20} className="text-red-400" />;
    default:
      return <Circle size={20} className="text-gray-600" />;
  }
}

function deriveStepStatus(
  stepKey: string,
  participant: ParticipantContext | null,
): "done" | "current" | "pending" | "error" {
  if (!participant) {
    return stepKey === "tenant" ? "current" : "pending";
  }

  const state = participant.state?.toUpperCase() || "";
  const hasDid = !!participant.identity && participant.identity !== "null";

  switch (stepKey) {
    case "tenant":
      return "done";
    case "participant":
      return state ? "done" : "pending";
    case "did":
      return hasDid ? "done" : state === "CREATED" ? "current" : "pending";
    case "credential":
      return hasDid ? "current" : "pending";
    case "active":
      return state === "ACTIVATED" ? "done" : "pending";
    default:
      return "pending";
  }
}

export default function OnboardingStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-gray-500 p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <OnboardingStatusContent />
    </Suspense>
  );
}

function OnboardingStatusContent() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [participants, setParticipants] = useState<ParticipantContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCtx, setSelectedCtx] = useState<ParticipantContext | null>(
    null,
  );

  useEffect(() => {
    fetchApi("/api/participants")
      .then((r) => r.json())
      .then((d) => {
        const list = d.participants || [];
        setParticipants(list);
        if (list.length > 0) {
          setSelectedCtx(list[0]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Onboarding Status</h1>
      <p className="text-gray-400 text-sm mb-8">
        Track your participant onboarding progress
        {tenantId && (
          <span className="text-xs text-gray-600 ml-2">
            (tenant: {tenantId.slice(0, 8)}…)
          </span>
        )}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading participant contexts…
        </div>
      ) : participants.length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck size={40} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No participant contexts found</p>
          <a href="/onboarding" className="text-sm text-layer2 hover:underline">
            Register a new participant →
          </a>
        </div>
      ) : (
        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          {/* Participant selector */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Participant Contexts
            </h2>
            {participants.map((p) => (
              <button
                key={p["@id"]}
                onClick={() => setSelectedCtx(p)}
                className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                  selectedCtx?.["@id"] === p["@id"]
                    ? "border-layer2 bg-layer2/10"
                    : "border-gray-700 hover:border-gray-500"
                }`}
              >
                <p className="font-medium text-gray-200 truncate">
                  {p.identity?.replace("did:web:", "").replace(/%3A/g, ":") ||
                    p["@id"].slice(0, 12) + "…"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  State: {p.state} · ID: {p["@id"].slice(0, 8)}…
                </p>
              </button>
            ))}
          </div>

          {/* Status stepper */}
          <div className="border border-gray-700 rounded-xl p-6">
            <h2 className="font-semibold mb-6">Onboarding Progress</h2>
            <div className="space-y-0">
              {STATUS_STEPS.map((s, i) => {
                const status = deriveStepStatus(s.key, selectedCtx);
                return (
                  <div key={s.key} className="flex gap-4">
                    {/* Vertical line + icon */}
                    <div className="flex flex-col items-center">
                      <StepIcon status={status} />
                      {i < STATUS_STEPS.length - 1 && (
                        <div
                          className={`w-0.5 flex-1 mt-1 ${
                            status === "done" ? "bg-green-700" : "bg-gray-700"
                          }`}
                        />
                      )}
                    </div>
                    {/* Content */}
                    <div className="pb-6">
                      <p
                        className={`font-medium text-sm ${
                          status === "done"
                            ? "text-green-400"
                            : status === "current"
                              ? "text-yellow-400"
                              : "text-gray-500"
                        }`}
                      >
                        {s.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Details */}
            {selectedCtx && (
              <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-500 w-28">Context ID</span>
                  <span className="text-gray-300 font-mono">
                    {selectedCtx["@id"]}
                  </span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-500 w-28">DID</span>
                  <span className="text-gray-300 font-mono break-all">
                    {selectedCtx.identity || "—"}
                  </span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-500 w-28">State</span>
                  <span
                    className={`font-medium ${
                      selectedCtx.state === "CREATED"
                        ? "text-green-400"
                        : selectedCtx.state === "ACTIVATED"
                          ? "text-blue-400"
                          : "text-yellow-400"
                    }`}
                  >
                    {selectedCtx.state}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
