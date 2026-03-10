"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";

interface Transfer {
  "@id": string;
  "edc:type"?: string;
  "edc:state"?: string;
  "edc:stateTimestamp"?: number;
  "edc:contractId"?: string;
  [key: string]: unknown;
}

interface ParticipantCtx {
  "@id": string;
  identity: string;
}

export default function DataTransferPage() {
  const searchParams = useSearchParams();
  const preselectedCtx = searchParams.get("participantId") || "";
  const contractId = searchParams.get("contractId") || "";

  const [participants, setParticipants] = useState<ParticipantCtx[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCtx, setSelectedCtx] = useState(preselectedCtx);

  // Initiate form
  const [initiating, setInitiating] = useState(false);
  const [newContractId, setNewContractId] = useState(contractId);
  const [newAssetId, setNewAssetId] = useState("");
  const [counterPartyAddr, setCounterPartyAddr] = useState("");
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/participants")
      .then((r) => r.json())
      .then((d) => {
        const list = d.participants || [];
        setParticipants(list);
        if (!selectedCtx && list.length > 0) {
          setSelectedCtx(list[0]["@id"]);
        }
      })
      .catch(() => {});
  }, []);

  // Load transfers when participant changes
  useEffect(() => {
    if (!selectedCtx) return;
    setLoading(true);
    fetchApi(`/api/transfers?participantId=${selectedCtx}`)
      .then((r) => r.json())
      .then((d) => {
        setTransfers(Array.isArray(d.transfers) ? d.transfers : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedCtx]);

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    setInitiating(true);
    setResult(null);

    try {
      const res = await fetchApi("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: selectedCtx,
          contractId: newContractId,
          assetId: newAssetId,
          counterPartyAddress: counterPartyAddr,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(`Transfer initiated: ${data["@id"] || JSON.stringify(data)}`);
        // Refresh
        const updated = await fetchApi(
          `/api/transfers?participantId=${selectedCtx}`,
        );
        const ud = await updated.json();
        setTransfers(Array.isArray(ud.transfers) ? ud.transfers : []);
      } else {
        const err = await res.json();
        setResult(`Error: ${err.error || "Initiation failed"}`);
      }
    } catch {
      setResult("Error: Failed to initiate transfer");
    } finally {
      setInitiating(false);
    }
  };

  function stateIcon(state: string) {
    const s = state?.toUpperCase() || "";
    if (s.includes("COMPLETED"))
      return <CheckCircle2 size={16} className="text-green-400" />;
    if (s.includes("ERROR") || s.includes("TERMINATED"))
      return <XCircle size={16} className="text-red-400" />;
    return <Clock size={16} className="text-yellow-400" />;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Data Transfers</h1>
      <p className="text-gray-400 text-sm mb-6">
        Monitor and initiate EDC-V data transfers (HttpData-PULL)
      </p>

      {/* Participant selector */}
      <div className="mb-6">
        <label className="text-xs text-gray-500 mb-1 block">
          Participant Context
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

      {/* Initiate transfer */}
      <div className="border border-gray-700 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ArrowRightLeft size={18} className="text-layer2" />
          <h2 className="font-semibold text-sm">Initiate Transfer</h2>
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

        <form onSubmit={handleInitiate} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Contract Agreement ID
              </label>
              <input
                type="text"
                required
                value={newContractId}
                onChange={(e) => setNewContractId(e.target.value)}
                placeholder="From negotiation result"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Asset ID
              </label>
              <input
                type="text"
                required
                value={newAssetId}
                onChange={(e) => setNewAssetId(e.target.value)}
                placeholder="e.g. fhir-patient-everything"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Counter-Party DSP Address
            </label>
            <input
              type="url"
              required
              value={counterPartyAddr}
              onChange={(e) => setCounterPartyAddr(e.target.value)}
              placeholder="http://health-dataspace-controlplane:8084/api/dsp"
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
              <ArrowRightLeft size={14} />
            )}
            Start Transfer
          </button>
        </form>
      </div>

      {/* Transfer list */}
      <h2 className="font-semibold text-sm mb-3">Transfer History</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading transfers…
        </div>
      ) : transfers.length === 0 ? (
        <p className="text-gray-500 text-sm">No transfers found</p>
      ) : (
        <div className="grid gap-2">
          {transfers.map((t) => (
            <div
              key={t["@id"]}
              className="flex items-center gap-3 p-3 border border-gray-700 rounded-lg"
            >
              {stateIcon((t["edc:state"] as string) || "")}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">
                  {t["@id"]}
                </p>
                <p className="text-xs text-gray-500">
                  Contract:{" "}
                  {(t["edc:contractId"] as string)?.slice(0, 16) || "—"} · Type:{" "}
                  {(t["edc:type"] as string) || "HttpData-PULL"}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  (t["edc:state"] as string)?.includes("COMPLETED")
                    ? "bg-green-900/40 text-green-400"
                    : (t["edc:state"] as string)?.includes("ERROR")
                      ? "bg-red-900/40 text-red-400"
                      : "bg-yellow-900/40 text-yellow-400"
                }`}
              >
                {(t["edc:state"] as string) || "UNKNOWN"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
