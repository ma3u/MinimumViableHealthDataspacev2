"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Download, KeyRound, Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import type { AgreementView } from "@/lib/agreement";
import OfferTerms from "@/components/OfferTerms";
import { useT } from "@/lib/i18n/translate";

/** A date and time in the reader's locale, or a dash. */
function when(iso: string | number | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * What a data user asks about an open transfer (#876): since when the data
 * can be fetched, until when, how, and under which policy. The agreement
 * comes from the connector (api/agreements/[id]); the period is the agreed
 * policy's, counted from the signing.
 */
export default function TransferDetails({
  participantId,
  contractId,
  openedAt,
  providerDid,
  providerName,
  consumerName,
}: {
  participantId: string;
  contractId: string;
  /** When the transfer reached STARTED: from then the data can be fetched. */
  openedAt: number;
  providerDid: string;
  providerName: string;
  consumerName: string;
}) {
  const t = useT("research");
  const [agreement, setAgreement] = useState<AgreementView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchApi(
      `/api/agreements/${encodeURIComponent(
        contractId,
      )}?participantId=${encodeURIComponent(participantId)}`,
    )
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        if (r.ok) setAgreement(body as AgreementView);
        else setError(String(body.detail || body.error || r.status));
      })
      .catch((e) => live && setError(String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [contractId, participantId]);

  return (
    <div
      data-testid="transfer-details"
      className="mt-3 space-y-4 rounded-lg border border-(--border) bg-(--surface)/60 p-4 text-sm"
    >
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-(--text-secondary)">
            {t("Access open since")}
          </dt>
          <dd data-testid="transfer-opened" className="text-(--text-primary)">
            {when(openedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-(--text-secondary)">
            {t("Contract signed")}
          </dt>
          <dd className="text-(--text-primary)">
            {loading ? "…" : when(agreement?.signedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-(--text-secondary)">
            {t("Usable until")}
          </dt>
          <dd data-testid="transfer-until" className="text-(--text-primary)">
            {loading
              ? "…"
              : agreement?.validUntil
                ? when(agreement.validUntil)
                : t("no end date in the contract")}
          </dd>
        </div>
      </dl>

      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-(--text-secondary)">
          <Download size={14} />
          {t("How to get the data")}
        </p>
        <p className="text-(--text-primary)">
          {t(
            "Open shows the data here; Download saves it as a JSON file. Each time, the hub fetches it from {provider}'s data plane with a short-lived token your connector holds; the token never reaches your browser.",
            { provider: providerName },
          )}
        </p>
        <p className="flex items-start gap-1.5 text-xs text-(--text-secondary)">
          <CalendarClock size={14} className="mt-0.5 shrink-0" />
          {t(
            "The access stays open until the transfer is completed or ended, or the contract period runs out; after that a new negotiation is needed.",
          )}
        </p>
      </div>

      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-(--text-secondary)">
          <KeyRound size={14} />
          {t("Access policy")}
        </p>
        <p className="text-(--text-primary)">
          {t(
            "{provider} decides who may see the offer at all. {consumer} saw it, so its connector met that policy, proving its membership with its credentials (DCP); the provider does not disclose the policy itself.",
            { provider: providerName, consumer: consumerName },
          )}
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-(--text-secondary)">
          <Loader2 size={14} className="animate-spin" />
          {t("Loading the agreement…")}
        </p>
      ) : agreement ? (
        <OfferTerms
          agreed
          policy={agreement.policy}
          providerDid={providerDid}
          providerName={providerName}
          consumerName={consumerName}
        />
      ) : (
        <p className="text-xs text-(--badge-inactive-text)">
          {t("The agreement could not be read: {detail}", { detail: error })}
        </p>
      )}
    </div>
  );
}
