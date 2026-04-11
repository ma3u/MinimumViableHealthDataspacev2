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
  state?: string;
  "edc:state"?: string;
  contractAgreementId?: string;
  "edc:contractAgreementId"?: string;
  counterPartyId?: string;
  "edc:counterPartyId"?: string;
  assetId?: string;
  [key: string]: unknown;
}

/** Read a negotiation field that may be edc:-prefixed or unprefixed */
function negField(n: Negotiation, field: string): string {
  return ((n as Record<string, unknown>)[field] ??
    (n as Record<string, unknown>)[`edc:${field}`] ??
    "") as string;
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
        <div className="flex items-center gap-2 text-[var(--text-secondary)] p-10">
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
          // identity holds the real DID; participantId is the UUID context ID
          const did = first.identity ?? "";
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
      return <CheckCircle2 size={16} className="text-[var(--success-text)]" />;
    if (s.includes("TERMINATED") || s.includes("ERROR"))
      return <XCircle size={16} className="text-[var(--danger-text)]" />;
    return <Clock size={16} className="text-[var(--warning-text)]" />;
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
    <div className="min-h-screen bg-[var(--bg)]">
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
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            Requesting as (your participant)
          </label>
          <select
            aria-label="Requesting as (your participant)"
            value={selectedCtx}
            onChange={(e) => setSelectedCtx(e.target.value)}
            className="w-full max-w-md px-3 py-2 bg-[var(--surface-2)] border border-[var(--border-ui)] rounded text-sm"
          >
            {participants.map((p) => (
              <option key={p["@id"]} value={p["@id"]}>
                {displayId(p)}
                {p.role ? ` [${p.role}]` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* ── Step 1: Catalog discovery ── */}
        <div className="border border-[var(--border)] rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Search size={16} className="text-teal-800 dark:text-teal-300" />
            <h2 className="font-semibold text-sm">
              Step 1 — Choose Data Provider
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Choose a data provider below — the catalog will be fetched
            automatically.
          </p>

          <div className="mb-4">
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">
              Data Provider
            </label>
            <select
              aria-label="Data Provider"
              value={selectedProviderCtx}
              onChange={(e) => {
                const chosen = participants.find(
                  (p) => p["@id"] === e.target.value,
                );
                if (!chosen) return;
                setSelectedProviderCtx(chosen["@id"]);
                setProviderCtxId(chosen["@id"]);
                // identity holds the real DID; participantId is the UUID context ID
                setProviderDid(chosen.identity ?? "");
                // Reset previous catalog results when provider changes
                setOffers([]);
                setSelectedOffer(null);
                setCatalogError(null);
              }}
              className="w-full max-w-md px-3 py-2 bg-[var(--surface-2)] border border-[var(--border-ui)] rounded text-sm"
              disabled={participants.length === 0}
            >
              {participants.length === 0 && (
                <option value="">Loading participants…</option>
              )}
              {participants
                .filter((p) => p["@id"] !== selectedCtx)
                .map((p) => (
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
            <div className="mt-3 p-3 rounded bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 text-xs flex gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{catalogError}</span>
            </div>
          )}

          {offers.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-[var(--text-secondary)] mb-2">
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
                      : "border-[var(--border)] hover:border-gray-500 bg-[var(--surface-2)]/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--text-primary)]">
                      {o.name || assetLabel(o.assetId)}
                    </span>
                    <div className="flex items-center gap-2">
                      {o.contentType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          {o.contentType}
                        </span>
                      )}
                      {selectedOffer?.offerId === o.offerId && (
                        <CheckCircle2
                          size={14}
                          className="text-teal-800 dark:text-teal-300"
                        />
                      )}
                    </div>
                  </div>
                  {o.description && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                      {o.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Step 2: Negotiation ── */}
        <div className="border border-[var(--border)] rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <FileSignature
              size={18}
              className="text-teal-800 dark:text-teal-300"
            />
            <h2 className="font-semibold text-sm">
              Step 2 — Initiate Negotiation
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Submit a DSP{" "}
            <code className="text-[var(--text-secondary)]">
              ContractRequest
            </code>{" "}
            with the selected ODRL offer. Protocol:{" "}
            <code className="text-[var(--text-secondary)]">
              dataspace-protocol-http:2025-1
            </code>
          </p>

          {result && (
            <div
              className={`mb-4 p-3 rounded text-sm ${
                result.startsWith("Error")
                  ? "bg-[var(--badge-inactive-bg)] border border-[var(--badge-inactive-border)] text-[var(--badge-inactive-text)]"
                  : "bg-[var(--badge-active-bg)] border border-[var(--badge-active-border)] text-[var(--badge-active-text)]"
              }`}
            >
              {result}
            </div>
          )}

          {!selectedOffer && (
            <div className="mb-4 p-3 rounded bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700/40 text-yellow-800 dark:text-yellow-400 text-xs flex gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>
                Complete Step 1 first — select a dataset offer above to
                negotiate.
              </span>
            </div>
          )}

          {selectedOffer && (
            <div className="mb-4 p-3 rounded bg-[var(--surface-2)]/60 border border-[var(--border)] text-sm">
              <span className="text-[var(--text-secondary)]">Selected:</span>{" "}
              <span className="text-[var(--text-primary)] font-medium">
                {selectedOffer.name || assetLabel(selectedOffer.assetId)}
              </span>
              {selectedOffer.contentType && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                  {selectedOffer.contentType}
                </span>
              )}
            </div>
          )}

          <form onSubmit={handleNegotiate} className="space-y-3">
            {/* Hidden fields — populated automatically from Step 1 */}
            <input type="hidden" value={assetId} />
            <input type="hidden" value={offerId} />
            <button
              type="submit"
              disabled={initiating || !offerId}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white dark:text-gray-900 rounded text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
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
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading negotiations…
          </div>
        ) : negotiations.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">
            No negotiations found
          </p>
        ) : (
          <div className="grid gap-2">
            {negotiations.map((n) => {
              const agreementId = negField(n, "contractAgreementId");
              const state = negField(n, "state");
              const counterParty = negField(n, "counterPartyId");
              return (
                <div
                  key={n["@id"]}
                  className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-lg"
                >
                  {stateIcon(state)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {n.assetId
                        ? assetLabel(n.assetId as string)
                        : n["@id"].slice(0, 12)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Provider: {counterParty ? didToName(counterParty) : "—"}
                      {state === "FINALIZED" && " · Agreement ready"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        state.includes("FINALIZED")
                          ? "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border border-[var(--badge-active-border)]"
                          : state.includes("ERROR")
                            ? "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border border-[var(--badge-inactive-border)]"
                            : "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-400"
                      }`}
                    >
                      {state || "UNKNOWN"}
                    </span>
                    {agreementId && (
                      <a
                        href={`/data/transfer?participantId=${selectedCtx}&contractId=${agreementId}`}
                        className="flex items-center gap-1 text-xs text-teal-800 dark:text-teal-300 hover:underline"
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
    </div>
  );
}
