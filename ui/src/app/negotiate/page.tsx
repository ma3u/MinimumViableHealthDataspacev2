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
  Search,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface ParticipantCtx {
  "@id": string;
  identity: string;
  participantId?: string;
  displayName?: string;
  role?: string;
}

interface CatalogOffer {
  assetId: string;
  offerId: string;
  assignerDid: string;
  name?: string;
  description?: string;
  contentType?: string;
}

interface Negotiation {
  "@id": string;
  "edc:state"?: string;
  "edc:contractAgreementId"?: string;
  "edc:counterPartyId"?: string;
  [key: string]: unknown;
}

/** Parse ODRL offers from a DCAT catalog response (handles multiple JSON-LD shapes) */
function parseOffers(catalog: Record<string, unknown>): CatalogOffer[] {
  const offers: CatalogOffer[] = [];
  let datasets = catalog["dataset"] ?? catalog["dcat:dataset"] ?? [];
  if (!Array.isArray(datasets)) datasets = [datasets];

  for (const ds of datasets as Record<string, unknown>[]) {
    const assetId = (ds["@id"] ?? ds["id"] ?? "") as string;
    const name = (ds["name"] ?? ds["dct:title"] ?? ds["title"] ?? "") as string;
    const description = (ds["description"] ??
      ds["dct:description"] ??
      "") as string;
    const contentType = (ds["contenttype"] ?? "") as string;

    let policies = ds["hasPolicy"] ?? ds["odrl:hasPolicy"] ?? [];
    if (!Array.isArray(policies)) policies = [policies];

    for (const p of policies as Record<string, unknown>[]) {
      const offerId = (p["@id"] ?? "") as string;
      const assigner = p["assigner"] ?? p["odrl:assigner"] ?? "";
      const assignerDid =
        typeof assigner === "object"
          ? ((assigner as Record<string, unknown>)["@id"] as string) ?? ""
          : (assigner as string);
      if (assetId && offerId) {
        offers.push({
          assetId,
          offerId,
          assignerDid,
          name,
          description,
          contentType,
        });
      }
    }
  }
  return offers;
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
  const preProviderDid = searchParams.get("providerDid") || "";

  const [participants, setParticipants] = useState<ParticipantCtx[]>([]);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCtx, setSelectedCtx] = useState("");

  // Step 1 — Catalog discovery
  const [selectedProviderCtx, setSelectedProviderCtx] = useState(
    preProviderId || "",
  );
  const [providerCtxId, setProviderCtxId] = useState(preProviderId);
  const [providerDid, setProviderDid] = useState(preProviderDid);
  const [dspBase] = useState("http://controlplane:8082/api/dsp");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [offers, setOffers] = useState<CatalogOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<CatalogOffer | null>(null);

  // Step 2 — Negotiation form (populated from selected offer)
  const [assetId, setAssetId] = useState(preAssetId);
  const [offerId, setOfferId] = useState("");
  const [initiating, setInitiating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/participants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list: ParticipantCtx[] = Array.isArray(d)
          ? d
          : d.participants ?? [];
        setParticipants(list);
        if (list.length > 0) setSelectedCtx(list[0]["@id"]);
        // Pre-select first non-consumer as provider
        if (list.length > 1 && !preProviderId) {
          const first = list[0];
          setSelectedProviderCtx(first["@id"]);
          setProviderCtxId(first["@id"]);
          const did = first.participantId ?? first.identity ?? "";
          setProviderDid(did);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCtx) return;
    setLoading(true);
    fetchApi(`/api/negotiations?participantId=${selectedCtx}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setNegotiations(Array.isArray(d) ? d : d.negotiations ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedCtx]);

  useEffect(() => {
    if (preAssetId && offers.length > 0) {
      const match = offers.find((o) => o.assetId === preAssetId);
      if (match) selectOffer(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

  /** Step 1: DCP catalog discovery via v1alpha participants/{ctxId}/catalog */
  const handleDiscoverCatalog = async () => {
    if (!selectedCtx || (!providerDid && !providerCtxId)) return;
    setCatalogLoading(true);
    setCatalogError(null);
    setOffers([]);
    setSelectedOffer(null);

    const did =
      providerDid ||
      `did:web:identityhub%3A7083:${providerCtxId
        .toLowerCase()
        .replace(/\s+/g, "-")}`;

    try {
      const res = await fetchApi(
        `/api/negotiations?participantId=${selectedCtx}&catalog=true&providerDid=${encodeURIComponent(
          did,
        )}`,
      );
      const data = await res.json();

      if (!res.ok) {
        const errData = data as Record<string, unknown>;
        setCatalogError(
          (errData.detail as string) ||
            (errData.error as string) ||
            "Failed to fetch catalog",
        );
        return;
      }

      const parsed = parseOffers(data as Record<string, unknown>);
      setOffers(parsed);
      if (parsed.length === 0) {
        setCatalogError(
          "No datasets with offers found. Ensure the provider has contract definitions and active participant contexts (VPAs in ACTIVE state).",
        );
      }
    } catch {
      setCatalogError("Network error fetching catalog");
    } finally {
      setCatalogLoading(false);
    }
  };

  function selectOffer(o: CatalogOffer) {
    setSelectedOffer(o);
    setAssetId(o.assetId);
    setOfferId(o.offerId);
  }

  /** Step 2: Submit DSP ContractRequest with real offer ID */
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
          counterPartyAddress: dspBase,
          counterPartyId: providerCtxId,
          providerDid: selectedOffer?.assignerDid || providerDid,
          offerId,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        setResult(
          `Negotiation initiated: ${data["@id"] || JSON.stringify(data)}`,
        );
        const updated = await fetchApi(
          `/api/negotiations?participantId=${selectedCtx}`,
        );
        const ud = await updated.json();
        setNegotiations(Array.isArray(ud) ? ud : ud.negotiations ?? []);
      } else {
        const err = (await res.json()) as Record<string, unknown>;
        setResult(
          `Error: ${
            (err.detail as string) ||
            (err.error as string) ||
            "Negotiation failed"
          }`,
        );
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

  function displayId(p: ParticipantCtx) {
    if (p.displayName) return p.displayName;
    const did = p.participantId ?? p.identity ?? "";
    return (
      did.replace("did:web:", "").replace(/%3A/gi, ":").split(":").pop() ||
      p["@id"].slice(0, 12)
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Contract Negotiation"
        icon={FileSignature}
        description="Negotiate data access contracts via the Dataspace Protocol using ODRL policies. Select a consumer participant, choose a dataset, and initiate a contract negotiation request that the data holder can accept or reject."
        prevStep={{ href: "/data/discover", label: "Discover Data" }}
        nextStep={{ href: "/data/transfer", label: "Data Transfer" }}
        infoText="Two steps: (1) choose a data provider and click Discover Offers to see what datasets are available; (2) select a dataset and click Start Negotiation to request access."
        docLink={{
          href: "https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol",
          label: "DSP Specification",
          external: true,
        }}
      />

      {/* Consumer context selector */}
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
              {displayId(p)}
              {p.role ? ` [${p.role}]` : ""} ({p["@id"].slice(0, 8)}…)
            </option>
          ))}
        </select>
      </div>

      {/* ── Step 1: Catalog discovery ── */}
      <div className="border border-gray-700 rounded-xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Search size={16} className="text-layer2" />
          <h2 className="font-semibold text-sm">
            Step 1 — Choose Data Provider
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Choose a data provider below — the catalog will be fetched
          automatically.
        </p>

        <div className="mb-4">
          <label className="text-xs text-gray-500 mb-1 block">
            Data Provider
          </label>
          <select
            value={selectedProviderCtx}
            onChange={(e) => {
              const chosen = participants.find(
                (p) => p["@id"] === e.target.value,
              );
              if (!chosen) return;
              setSelectedProviderCtx(chosen["@id"]);
              setProviderCtxId(chosen["@id"]);
              setProviderDid(chosen.participantId ?? chosen.identity ?? "");
              // Reset previous catalog results when provider changes
              setOffers([]);
              setSelectedOffer(null);
              setCatalogError(null);
            }}
            className="w-full max-w-md px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
            disabled={participants.length === 0}
          >
            {participants.length === 0 && (
              <option value="">Loading participants…</option>
            )}
            {participants.map((p) => (
              <option key={p["@id"]} value={p["@id"]}>
                {displayId(p)}
                {p.role ? ` [${p.role}]` : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={catalogLoading || !selectedCtx || !selectedProviderCtx}
          onClick={handleDiscoverCatalog}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium hover:bg-gray-600 disabled:opacity-50"
        >
          {catalogLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <BookOpen size={14} />
          )}
          Discover Offers
        </button>

        {catalogError && (
          <div className="mt-3 p-3 rounded bg-red-900/30 border border-red-700 text-red-300 text-xs flex gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{catalogError}</span>
          </div>
        )}

        {offers.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-400 mb-2">
              {offers.length} offer(s) found — select one to negotiate:
            </p>
            {offers.map((o) => (
              <button
                key={o.offerId}
                type="button"
                onClick={() => selectOffer(o)}
                className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                  selectedOffer?.offerId === o.offerId
                    ? "border-layer2 bg-layer2/10"
                    : "border-gray-700 hover:border-gray-500 bg-gray-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-200">
                    {o.name || o.assetId}
                  </span>
                  {selectedOffer?.offerId === o.offerId && (
                    <CheckCircle2 size={14} className="text-layer2" />
                  )}
                </div>
                {o.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {o.description}
                  </p>
                )}
                <div className="flex gap-4 mt-1 flex-wrap">
                  <span className="text-xs text-gray-600">
                    Asset: <code className="text-gray-400">{o.assetId}</code>
                  </span>
                  {o.contentType && (
                    <span className="text-xs text-gray-600">
                      {o.contentType}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5 truncate">
                  Offer:{" "}
                  <code className="text-gray-500">
                    {o.offerId.slice(0, 72)}
                  </code>
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 2: Negotiation ── */}
      <div className="border border-gray-700 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <FileSignature size={18} className="text-layer2" />
          <h2 className="font-semibold text-sm">
            Step 2 — Initiate Negotiation
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Submit a DSP <code className="text-gray-400">ContractRequest</code>{" "}
          with the selected ODRL offer. Protocol:{" "}
          <code className="text-gray-400">dataspace-protocol-http:2025-1</code>
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

        {!selectedOffer && (
          <div className="mb-4 p-3 rounded bg-yellow-900/20 border border-yellow-700/40 text-yellow-400 text-xs flex gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              Complete Step 1 first — a valid ODRL offer @id is required for DSP
              contract negotiation.
            </span>
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
                placeholder="Populated from Step 1"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                ODRL Offer ID{" "}
                <span className="text-yellow-500 text-xs">(from catalog)</span>
              </label>
              <input
                type="text"
                required
                value={offerId}
                onChange={(e) => setOfferId(e.target.value)}
                placeholder="Populated from Step 1"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={initiating || !offerId}
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

      {/* Negotiation history */}
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
