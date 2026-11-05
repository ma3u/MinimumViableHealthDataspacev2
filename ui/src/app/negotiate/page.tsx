"use client";

import { fetchApi } from "@/lib/api";
import { buildDemoCatalog, type DemoAssetEntry } from "@/lib/demo-catalog";
import { DSP_PROTOCOL } from "@/lib/dsp-protocol";
import { didToName } from "@/lib/participant-name";
import { IS_STATIC } from "@/lib/static-export";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
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
import RowSourceBadge from "@/components/RowSourceBadge";
import type { RowSource } from "@/lib/row-provenance";
import { T, useT } from "@/lib/i18n/translate";

interface ParticipantCtx {
  "@id": string;
  identity: string;
  participantId?: string;
  displayName?: string;
  role?: string;
}

/** A HealthDCAT-AP dataset the catalog page sent here (`?dataset=`). */
interface RequestedDataset {
  title: string;
  publisher: string;
  providers: string[];
}

interface CatalogOffer {
  assetId: string;
  offerId: string;
  assignerDid: string;
  name?: string;
  description?: string;
  contentType?: string;
  /** The provider's DSP address, as the catalog's distribution names it. */
  endpoint?: string;
}

/** The first distribution's DSP endpoint, in either JSON-LD spelling. */
function datasetEndpoint(ds: Record<string, unknown>): string {
  const one = (v: unknown) =>
    (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | undefined;
  const dist = one(ds["distribution"] ?? ds["dcat:distribution"]);
  const svc = one(dist?.["accessService"] ?? dist?.["dcat:accessService"]);
  const url = svc?.["endpointURL"] ?? svc?.["dcat:endpointURL"] ?? "";
  return typeof url === "string" ? url : "";
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

/**
 * Who can be asked for a catalog: anyone but the requester and a DATA_USER.
 * A DATA_USER requests data under a permit; it holds none to offer (EHDS
 * Art. 2). A context without a role (a live connector that does not say)
 * stays in the list. #876
 */
function isProviderFor(p: ParticipantCtx, consumerId: string): boolean {
  return p["@id"] !== consumerId && p.role !== "DATA_USER";
}

/** The provider to preselect: the first data holder, else any provider. */
function defaultProvider(
  list: ParticipantCtx[],
  consumerId: string,
): ParticipantCtx | undefined {
  const providers = list.filter((p) => isProviderFor(p, consumerId));
  return providers.find((p) => p.role === "DATA_HOLDER") ?? providers[0];
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
    const endpoint = datasetEndpoint(ds);

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
          ...(endpoint ? { endpoint } : {}),
        });
      }
    }
  }
  return offers;
}

export default function NegotiatePage() {
  const tc = useT("common");
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-(--text-secondary) p-10">
          <Loader2 size={16} className="animate-spin" />
          {tc("Loading…")}
        </div>
      }
    >
      <NegotiateContent />
    </Suspense>
  );
}

function NegotiateContent() {
  const t = useT("research");
  const tn = useT("nav");
  const searchParams = useSearchParams();
  const preAssetId = searchParams.get("assetId") || "";
  const preProviderId = searchParams.get("providerId") || "";
  const preProviderDid = searchParams.get("providerDid") || "";
  // The catalog's "Request Access" sends the HealthDCAT-AP dataset id. It is
  // not a DSP asset id, so it cannot select an offer; it names the dataset
  // and, through its publisher, the participant to ask. #876
  const preDataset = searchParams.get("dataset") || "";
  const [requested, setRequested] = useState<RequestedDataset | null>(null);
  const datasetHolderApplied = useRef(false);

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
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogNote, setCatalogNote] = useState<string | null>(null);
  const [offers, setOffers] = useState<CatalogOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<CatalogOffer | null>(null);

  // Step 2 — Negotiation form (populated from selected offer)
  const [assetId, setAssetId] = useState(preAssetId);
  const [offerId, setOfferId] = useState("");
  const [initiating, setInitiating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultIsError, setResultIsError] = useState(false);

  useEffect(() => {
    fetchApi("/api/participants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list: ParticipantCtx[] = Array.isArray(d)
          ? d
          : d.participants ?? [];
        setParticipants(list);
        // The requester is a data user when there is one: they are the ones
        // who negotiate access. The provider used to be list[0] as well, the
        // requester itself, which the dropdown could not show (it leaves the
        // requester out), so it displayed the next entry while the catalog
        // request asked the requester for its own offers. #876
        const consumer =
          list.find((p) => p.role === "DATA_USER") ?? list[0] ?? undefined;
        if (consumer) setSelectedCtx(consumer["@id"]);
        if (consumer && !preProviderId) {
          chooseProvider(defaultProvider(list, consumer["@id"]));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preDataset) return;
    fetchApi("/api/catalog")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = (
          Array.isArray(d) ? d : d.datasets ?? d.catalog ?? []
        ) as Record<string, unknown>[];
        const ds = list.find(
          (x) => x.id === preDataset || x.title === preDataset,
        );
        setRequested({
          title: (ds?.title as string) || preDataset,
          publisher: (ds?.publisher as string) || "",
          providers: Array.isArray(ds?.providers)
            ? (ds.providers as string[])
            : [],
        });
      })
      .catch(() =>
        setRequested({ title: preDataset, publisher: "", providers: [] }),
      );
  }, [preDataset]);

  // The participant that holds the requested dataset, if it is one of ours
  const datasetHolder = requested
    ? participants.find(
        (p) =>
          isProviderFor(p, selectedCtx) &&
          !!p.displayName &&
          [requested.publisher, ...requested.providers].includes(p.displayName),
      )
    : undefined;

  useEffect(() => {
    if (datasetHolderApplied.current || preProviderId || !datasetHolder) return;
    datasetHolderApplied.current = true;
    chooseProvider(datasetHolder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetHolder]);

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

  function chooseProvider(chosen: ParticipantCtx | undefined) {
    setSelectedProviderCtx(chosen?.["@id"] ?? "");
    setProviderCtxId(chosen?.["@id"] ?? "");
    // identity holds the real DID; participantId is the UUID context ID
    setProviderDid(chosen?.identity ?? "");
    // Reset previous catalog results when provider changes
    setOffers([]);
    setSelectedOffer(null);
    setCatalogError(null);
    setCatalogNote(null);
  }

  /** Step 1: DCP catalog discovery via v1alpha participants/{ctxId}/catalog */
  const handleDiscoverCatalog = async () => {
    if (!selectedCtx || (!providerDid && !providerCtxId)) return;
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogNote(null);
    setOffers([]);
    setSelectedOffer(null);

    const did =
      providerDid ||
      `did:web:identityhub%3A7083:${providerCtxId
        .toLowerCase()
        .replace(/\s+/g, "-")}`;

    try {
      // The static build has no API route, and fetchApi() would answer the
      // catalog request with negotiations.json. Build the same demo catalog
      // the route falls back to on the hub, from the same assets file.
      const res = IS_STATIC
        ? await fetchApi("/api/assets")
        : await fetchApi(
            `/api/negotiations?participantId=${selectedCtx}&catalog=true&providerDid=${encodeURIComponent(
              did,
            )}`,
          );
      const data = IS_STATIC
        ? buildDemoCatalog((await res.json()) as DemoAssetEntry[], did) ?? {
            dataset: [],
          }
        : await res.json();

      if (!res.ok) {
        const errData = data as Record<string, unknown>;
        setCatalogError(
          (errData.detail as string) ||
            (errData.error as string) ||
            t("Failed to fetch catalog"),
        );
        return;
      }

      const payload = data as Record<string, unknown>;
      if (payload.demo === true) {
        setCatalogNote(
          (payload.demoReason as string) ||
            t(
              "These offers come from the demonstrator's own catalogue, not from a live DSP request.",
            ),
        );
      }

      const parsed = parseOffers(payload);
      setOffers(parsed);
      if (parsed.length === 0) {
        setCatalogError(
          t(
            "No datasets with offers found. Ensure the provider has contract definitions and active participant contexts (VPAs in ACTIVE state).",
          ),
        );
      }
    } catch {
      setCatalogError(t("Network error fetching catalog"));
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
    setResultIsError(false);

    try {
      const res = await fetchApi("/api/negotiations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: selectedCtx,
          assetId,
          // The address the provider's catalog gave, else the server's own
          // DSP base. Never a fixed host: http://controlplane does not
          // resolve on Azure (#876).
          counterPartyAddress: selectedOffer?.endpoint,
          counterPartyId: providerCtxId,
          providerDid: selectedOffer?.assignerDid || providerDid,
          offerId,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        setResult(
          data.demo === true
            ? t("Demo negotiation recorded: {id}. {reason}", {
                id: String(data["@id"]),
                reason: String(data.demoReason ?? ""),
              })
            : t("Negotiation initiated: {id}", {
                id: String(data["@id"] || JSON.stringify(data)),
              }),
        );
        const updated = await fetchApi(
          `/api/negotiations?participantId=${selectedCtx}`,
        );
        const ud = await updated.json();
        const list = (Array.isArray(ud) ? ud : ud.negotiations ?? []) as
          | Negotiation[]
          | [];
        // The API now keeps a demo negotiation in memory and returns it from this
        // refetch, so prepend it only if the refetch did not carry it: the row can
        // then neither vanish (which looks like a failure) nor appear twice.
        const missing =
          data.demo === true &&
          !list.some((n) => n["@id"] === (data["@id"] as string));
        setNegotiations(
          missing ? [data as unknown as Negotiation, ...list] : list,
        );
      } else {
        const err = (await res.json()) as Record<string, unknown>;
        setResultIsError(true);
        setResult(
          t("Error: {detail}", {
            detail:
              (err.detail as string) ||
              (err.error as string) ||
              t("Negotiation failed"),
          }),
        );
      }
    } catch {
      setResultIsError(true);
      setResult(
        t("Error: {detail}", {
          detail: t("Failed to initiate negotiation"),
        }),
      );
    } finally {
      setInitiating(false);
    }
  };

  function stateIcon(state: string) {
    const s = state?.toUpperCase() || "";
    if (s.includes("FINALIZED") || s.includes("AGREED"))
      return <CheckCircle2 size={16} className="text-(--success-text)" />;
    if (s.includes("TERMINATED") || s.includes("ERROR"))
      return <XCircle size={16} className="text-(--danger-text)" />;
    return <Clock size={16} className="text-(--warning-text)" />;
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
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <PageIntro
          title={t("Contract Negotiation")}
          icon={FileSignature}
          description={t(
            "Negotiate data access contracts via the Dataspace Protocol using ODRL policies. Select a consumer participant, choose a dataset, and initiate a contract negotiation request that the data holder can accept or reject.",
          )}
          prevStep={{ href: "/data/discover", label: t("Discover Data") }}
          nextStep={{ href: "/data/transfer", label: t("Data Transfer") }}
          infoText={t(
            "Two steps: (1) choose a data provider and click Discover Offers to see what datasets are available; (2) select a dataset and click Start Negotiation to request access.",
          )}
          docLink={{
            href: "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
            label: t("DSP Specification"),
            external: true,
          }}
        />

        {/* Consumer context selector */}
        <div className="mb-6">
          <label className="text-xs text-(--text-secondary) mb-1 block">
            {t("Requesting as (your participant)")}
          </label>
          <select
            aria-label={t("Requesting as (your participant)")}
            value={selectedCtx}
            onChange={(e) => {
              setSelectedCtx(e.target.value);
              if (e.target.value === selectedProviderCtx) {
                chooseProvider(defaultProvider(participants, e.target.value));
              }
            }}
            className="w-full max-w-md px-3 py-2 bg-(--surface-2) border border-(--border-ui) rounded-sm text-sm"
          >
            {participants.map((p) => (
              <option key={p["@id"]} value={p["@id"]}>
                {displayId(p)}
                {p.role ? ` [${p.role}]` : ""}
              </option>
            ))}
          </select>
        </div>

        {requested && (
          <div
            data-testid="requested-dataset"
            className="mb-5 p-3 rounded-sm bg-(--surface-2)/60 border border-(--border) text-sm text-(--text-primary) flex gap-2"
          >
            <BookOpen size={16} className="shrink-0 mt-0.5" />
            <span>
              {datasetHolder
                ? t(
                    "You asked for access to “{title}”, published by {publisher}. In this demonstrator a catalogue dataset is requested through its holder's DSP offers, so {holder} is preselected below: discover the offers and choose the one that covers this dataset.",
                    {
                      title: requested.title,
                      publisher:
                        requested.publisher || datasetHolder.displayName || "",
                      holder: datasetHolder.displayName ?? "",
                    },
                  )
                : t(
                    "No participant of this dataspace offers “{title}” yet, so there is nothing to negotiate for it. Choose a data provider below to see what can be negotiated.",
                    { title: requested.title },
                  )}
            </span>
          </div>
        )}

        {/* ── Step 1: Catalog discovery ── */}
        <div className="border border-(--border) rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Search size={16} className="text-teal-800 dark:text-teal-300" />
            <h2 className="font-semibold text-sm">
              {t("Step 1: Choose Data Provider")}
            </h2>
          </div>
          <p className="text-xs text-(--text-secondary) mb-4">
            {t(
              "Choose a data provider below; the catalog will be fetched automatically.",
            )}
          </p>

          <div className="mb-4">
            <label className="text-xs text-(--text-secondary) mb-1 block">
              {t("Data Provider")}
            </label>
            <select
              aria-label={t("Data Provider")}
              value={selectedProviderCtx}
              onChange={(e) => {
                const chosen = participants.find(
                  (p) => p["@id"] === e.target.value,
                );
                if (chosen) chooseProvider(chosen);
              }}
              className="w-full max-w-md px-3 py-2 bg-(--surface-2) border border-(--border-ui) rounded-sm text-sm"
              disabled={participants.length === 0}
            >
              {participants.length === 0 && (
                <option value="">{t("Loading participants…")}</option>
              )}
              {participants
                .filter((p) => isProviderFor(p, selectedCtx))
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
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-sm text-sm font-medium hover:bg-gray-600 disabled:opacity-50"
          >
            {catalogLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <BookOpen size={14} />
            )}
            {t("Discover Offers")}
          </button>

          {catalogError && (
            <div className="mt-3 p-3 rounded-sm bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 text-xs flex gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{catalogError}</span>
            </div>
          )}

          {catalogNote && (
            <div className="mt-3 p-3 rounded-sm bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs flex gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{catalogNote}</span>
            </div>
          )}

          {offers.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-(--text-secondary) mb-2">
                {t("{n} offer(s) found. Select one to negotiate:", {
                  n: offers.length,
                })}
              </p>
              {offers.map((o) => (
                <button
                  key={o.offerId}
                  type="button"
                  onClick={() => selectOffer(o)}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                    selectedOffer?.offerId === o.offerId
                      ? "border-layer2 bg-layer2/10"
                      : "border-(--border) hover:border-gray-500 bg-(--surface-2)/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-(--text-primary)">
                      {o.name || assetLabel(o.assetId)}
                    </span>
                    <div className="flex items-center gap-2">
                      {o.contentType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
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
                    <p className="text-xs text-(--text-secondary) mt-0.5 truncate">
                      {o.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Step 2: Negotiation ── */}
        <div className="border border-(--border) rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <FileSignature
              size={18}
              className="text-teal-800 dark:text-teal-300"
            />
            <h2 className="font-semibold text-sm">
              {t("Step 2: Initiate Negotiation")}
            </h2>
          </div>
          <p className="text-xs text-(--text-secondary) mb-4">
            <T
              area="research"
              tags={{ c: <code className="text-(--text-secondary)" /> }}
            >
              {
                "Submit a DSP <c>ContractRequest</c> with the selected ODRL offer. Protocol:"
              }
            </T>{" "}
            <code className="text-(--text-secondary)">{DSP_PROTOCOL}</code>
          </p>

          {result && (
            <div
              className={`mb-4 p-3 rounded text-sm ${
                resultIsError
                  ? "bg-(--badge-inactive-bg) border border-(--badge-inactive-border) text-(--badge-inactive-text)"
                  : "bg-(--badge-active-bg) border border-(--badge-active-border) text-(--badge-active-text)"
              }`}
            >
              {result}
            </div>
          )}

          {!selectedOffer && (
            <div className="mb-4 p-3 rounded-sm bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700/40 text-yellow-800 dark:text-yellow-400 text-xs flex gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>
                {t(
                  "Complete Step 1 first: select a dataset offer above to negotiate.",
                )}
              </span>
            </div>
          )}

          {selectedOffer && (
            <div className="mb-4 p-3 rounded-sm bg-(--surface-2)/60 border border-(--border) text-sm">
              <span className="text-(--text-secondary)">{t("Selected:")}</span>{" "}
              <span className="text-(--text-primary) font-medium">
                {selectedOffer.name || assetLabel(selectedOffer.assetId)}
              </span>
              {selectedOffer.contentType && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
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
              className="flex items-center gap-2 px-4 py-2 bg-(--accent) text-white dark:text-gray-900 rounded-sm text-sm font-medium hover:bg-(--accent-hover) disabled:opacity-50"
            >
              {initiating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileSignature size={14} />
              )}
              {t("Start Negotiation")}
            </button>
          </form>
        </div>

        {/* Negotiation history */}
        <h2 className="font-semibold text-sm mb-3">
          {t("Negotiation History")}
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-(--text-secondary)">
            <Loader2 size={16} className="animate-spin" />
            {t("Loading negotiations…")}
          </div>
        ) : negotiations.length === 0 ? (
          <p className="text-(--text-secondary) text-sm">
            {t("No negotiations found")}
          </p>
        ) : (
          <div className="grid gap-2">
            {negotiations.map((n) => {
              const agreementId = negField(n, "contractAgreementId");
              const state = negField(n, "state");
              const counterParty = negField(n, "counterPartyId");
              // On a PROVIDER-side negotiation the counter-party is the one
              // who asked, so it is the consumer, not the provider.
              const counterPartyIsConsumer = negField(n, "type") === "PROVIDER";
              return (
                <div
                  key={n["@id"]}
                  className="flex items-center gap-3 p-3 border border-(--border) rounded-lg"
                >
                  {stateIcon(state)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--text-primary) truncate">
                      {n.assetId
                        ? assetLabel(n.assetId as string)
                        : n["@id"].slice(0, 12)}
                    </p>
                    <p className="text-xs text-(--text-secondary)">
                      {counterPartyIsConsumer ? t("Consumer:") : t("Provider:")}{" "}
                      {counterParty ? didToName(counterParty) : "—"}
                      {state === "FINALIZED" && ` · ${t("Agreement ready")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* A demo or sample negotiation is not one a DSP
                        counter-party agreed to. The row has to say so: an
                        unmarked FINALIZED badge in front of a regulator would
                        claim an agreement that nobody ever signed. #358 */}
                    <RowSourceBadge
                      source={
                        (n.source as RowSource | undefined) ??
                        (n.demo === true ? "demo" : undefined)
                      }
                      reason={n.demoReason as string | undefined}
                    />
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        state.includes("FINALIZED")
                          ? "bg-(--badge-active-bg) text-(--badge-active-text) border border-(--badge-active-border)"
                          : state.includes("ERROR")
                            ? "bg-(--badge-inactive-bg) text-(--badge-inactive-text) border border-(--badge-inactive-border)"
                            : "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-400"
                      }`}
                    >
                      {state || "UNKNOWN"}
                    </span>
                    {agreementId && (
                      // A Link, not an <a>: Next adds the GitHub Pages base
                      // path to it, and a bare "/data/transfer" left the site
                      // for ma3u.github.io/data/transfer, a 404. #876
                      <Link
                        href={`/data/transfer?participantId=${encodeURIComponent(
                          selectedCtx,
                        )}&contractId=${encodeURIComponent(agreementId)}`}
                        className="flex items-center gap-1 text-xs text-teal-800 dark:text-teal-300 hover:underline"
                      >
                        {tn("Transfer")} <ArrowRight size={12} />
                      </Link>
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
