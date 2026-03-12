"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileSignature,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface ParticipantCtx {
  "@id": string;
  identity: string;
}

interface Negotiation {
  "@id": string;
  "edc:state"?: string;
  "edc:contractAgreementId"?: string;
  "edc:counterPartyId"?: string;
  [key: string]: unknown;
}

export default function NegotiatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-gray-500 p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <NegotiateContent />
    </Suspense>
  );
}

function NegotiateContent() {
  const searchParams = useSearchParams();
  const preAssetId = searchParams.get("assetId") || "";
  const preProviderId = searchParams.get("providerId") || "";

  const [participants, setParticipants] = useState<ParticipantCtx[]>([]);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCtx, setSelectedCtx] = useState("");

  // Negotiation form
  const [assetId, setAssetId] = useState(preAssetId);
  const [providerDsp, setProviderDsp] = useState(
    "http://health-dataspace-controlplane:8084/api/dsp",
  );
  const [providerId, setProviderId] = useState(preProviderId);
  const [initiating, setInitiating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/participants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        // /api/participants returns flat array or { participants: [...] }
        const list: ParticipantCtx[] = Array.isArray(d)
          ? d
          : d.participants || [];
        setParticipants(list);
        // Default to first consumer-like context
        if (list.length > 0) {
          setSelectedCtx(list[0]["@id"]);
        }
      })
      .catch(() => {});
  }, []);

  // Load negotiations when participant changes
  useEffect(() => {
    if (!selectedCtx) return;
    setLoading(true);
    fetchApi(`/api/negotiations?participantId=${selectedCtx}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        // /api/negotiations returns flat array or { negotiations: [...] }
        setNegotiations(Array.isArray(d) ? d : d.negotiations || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedCtx]);

  const handleNegotiate = async (e: React.FormEvent) => {
    e.preventDefault();
    setInitiating(true);
    setResult(null);

    try {
      const res = await fetchApi("/api/negotiations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: selectedCtx,
          assetId,
          counterPartyAddress: providerDsp,
          counterPartyId: providerId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(
          `Negotiation initiated: ${data["@id"] || JSON.stringify(data)}`,
        );
        // Refresh
        const updated = await fetchApi(
          `/api/negotiations?participantId=${selectedCtx}`,
        );
        const ud = await updated.json();
        setNegotiations(Array.isArray(ud) ? ud : ud.negotiations || []);
      } else {
        const err = await res.json();
        setResult(`Error: ${err.error || "Negotiation failed"}`);
      }
    } catch {
      setResult("Error: Failed to initiate negotiation");
    } finally {
      setInitiating(false);
    }
  };

  function stateIcon(state: string) {
    const s = state?.toUpperCase() || "";
    if (s.includes("FINALIZED") || s.includes("AGREED"))
      return <CheckCircle2 size={16} className="text-green-400" />;
    if (s.includes("TERMINATED") || s.includes("ERROR"))
      return <XCircle size={16} className="text-red-400" />;
    return <Clock size={16} className="text-yellow-400" />;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Contract Negotiation"
        icon={FileSignature}
        description="Negotiate data access contracts via the Dataspace Protocol using ODRL policies. Select a consumer participant, choose a dataset, and initiate a contract negotiation request that the data holder can accept or reject."
        prevStep={{ href: "/data/discover", label: "Discover Data" }}
        nextStep={{ href: "/data/transfer", label: "Data Transfer" }}
        infoText="Contract negotiations follow the DSP negotiation state machine (REQUESTED → AGREED → FINALIZED). Both parties must hold valid EHDS credentials for the negotiation to succeed."
        docLink={{
          href: "https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol",
          label: "DSP Specification",
          external: true,
        }}
      />

      {/* Participant selector */}
      <div className="mb-6">
        <label className="text-xs text-gray-500 mb-1 block">
          Your Participant Context (consumer)
        </label>
        <select
          value={selectedCtx}
          onChange={(e) => setSelectedCtx(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
        >
          {participants.map((p) => (
            <option key={p["@id"]} value={p["@id"]}>
              {p.identity?.replace("did:web:", "").replace(/%3A/g, ":") ||
                p["@id"].slice(0, 16)}
            </option>
          ))}
        </select>
      </div>

      {/* Negotiate form */}
      <div className="border border-gray-700 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <FileSignature size={18} className="text-layer2" />
          <h2 className="font-semibold text-sm">Initiate Negotiation</h2>
        </div>

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

        <form onSubmit={handleNegotiate} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Asset ID
              </label>
              <input
                type="text"
                required
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                placeholder="e.g. fhir-patient-everything"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Provider Participant ID
              </label>
              <input
                type="text"
                required
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                placeholder="Context ID of the provider"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Provider DSP Endpoint
            </label>
            <input
              type="url"
              required
              value={providerDsp}
              onChange={(e) => setProviderDsp(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
            />
          </div>
          <button
            type="submit"
            disabled={initiating}
            className="flex items-center gap-2 px-4 py-2 bg-layer2 text-white rounded text-sm font-medium hover:bg-layer2/90 disabled:opacity-50"
          >
            {initiating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileSignature size={14} />
            )}
            Start Negotiation
          </button>
        </form>
      </div>

      {/* Negotiation list */}
      <h2 className="font-semibold text-sm mb-3">Negotiation History</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading negotiations…
        </div>
      ) : negotiations.length === 0 ? (
        <p className="text-gray-500 text-sm">No negotiations found</p>
      ) : (
        <div className="grid gap-2">
          {negotiations.map((n) => {
            const agreementId = n["edc:contractAgreementId"] as string;
            return (
              <div
                key={n["@id"]}
                className="flex items-center gap-3 p-3 border border-gray-700 rounded-lg"
              >
                {stateIcon((n["edc:state"] as string) || "")}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {n["@id"]}
                  </p>
                  <p className="text-xs text-gray-500">
                    Counter-party:{" "}
                    {(n["edc:counterPartyId"] as string)?.slice(0, 20) || "—"}
                    {agreementId &&
                      ` · Agreement: ${agreementId.slice(0, 16)}…`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      ((n["edc:state"] as string) || "").includes("FINALIZED")
                        ? "bg-green-900/40 text-green-400"
                        : ((n["edc:state"] as string) || "").includes("ERROR")
                          ? "bg-red-900/40 text-red-400"
                          : "bg-yellow-900/40 text-yellow-400"
                    }`}
                  >
                    {(n["edc:state"] as string) || "UNKNOWN"}
                  </span>
                  {agreementId && (
                    <a
                      href={`/data/transfer?participantId=${selectedCtx}&contractId=${agreementId}`}
                      className="flex items-center gap-1 text-xs text-layer2 hover:underline"
                    >
                      Transfer <ArrowRight size={12} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
