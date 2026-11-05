"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ScrollText, ShieldCheck } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { describePolicy, renderPolicyText } from "@/lib/odrl-describe";
import { validatePolicy } from "@/lib/odrl-validate";
import OdrlJsonHighlighter from "@/components/OdrlJsonHighlighter";
import { useT } from "@/lib/i18n/translate";

/** What /api/odrl/scope answers about the signed-in data user's permits. */
interface OdrlScope {
  permissions?: string[];
  prohibitions?: string[];
  permits?: {
    permitId: string;
    datasetTitle?: string | null;
    purpose?: string | null;
    validUntil?: string | null;
  }[];
}

/** `re_identification` → `re identification`, as the scope names them. */
const words = (token: string) => token.replace(/_/g, " ").toLowerCase();

/**
 * The terms a data user agrees to by negotiating an offer (#876): the offer's
 * ODRL policy in plain language, what it leaves open measured against the
 * EHDS (lib/odrl-validate.ts, the same check as /admin/policies), the raw
 * policy, and the data permit that binds the use as well. The negotiation
 * starts only once the user has ticked that they agree.
 *
 * A DSP catalogue offer names no assigner: it is the catalogue's own
 * participant. The provider is filled in before the check, so ODRL's
 * "an Offer must name its assigner" does not report the catalogue's form.
 */
export default function OfferTerms({
  policy,
  providerDid,
  providerName,
  consumerName,
  accepted,
  onAcceptedChange,
}: {
  policy: Record<string, unknown>;
  providerDid: string;
  providerName: string;
  consumerName: string;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  const t = useT("research");
  const ta = useT("admin");
  const [scope, setScope] = useState<OdrlScope | null>(null);

  useEffect(() => {
    let live = true;
    fetchApi("/api/odrl/scope")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => live && setScope(s as OdrlScope | null))
      .catch(() => live && setScope(null));
    return () => {
      live = false;
    };
  }, []);

  const withAssigner = useMemo(
    () =>
      policy.assigner || policy["odrl:assigner"] || !providerDid
        ? policy
        : { ...policy, assigner: providerDid },
    [policy, providerDid],
  );
  const description = useMemo(
    () => describePolicy(withAssigner),
    [withAssigner],
  );
  const findings = useMemo(
    () => validatePolicy(withAssigner).filter((f) => f.severity !== "info"),
    [withAssigner],
  );
  const permits = scope?.permits ?? [];

  return (
    <div
      data-testid="offer-terms"
      className="mb-4 rounded-lg border border-(--border) bg-(--surface-2)/40 p-4 space-y-4 text-sm"
    >
      <div>
        <h3 className="flex items-center gap-2 font-semibold text-(--text-primary)">
          <ScrollText size={16} />
          {t("The terms you agree to")}
        </h3>
        <p className="text-xs text-(--text-secondary) mt-1">
          {t(
            "{provider} offers this data under the policy below. Starting the negotiation means {consumer} accepts it.",
            { provider: providerName, consumer: consumerName },
          )}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-(--text-secondary) uppercase tracking-wide">
          {t("The offer's policy (ODRL)")}
        </p>
        <p
          data-testid="offer-policy-description"
          className="text-(--text-primary) mt-1"
        >
          {description.sentences.map((s) => renderPolicyText(s, ta)).join(" ")}
        </p>
      </div>

      {findings.length > 0 && (
        <div data-testid="offer-policy-gaps">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            <AlertCircle size={14} />
            {t("What the offer leaves open ({n})", { n: findings.length })}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-(--text-secondary) list-disc pl-5">
            {findings.map((f) => (
              <li key={f.code}>
                {renderPolicyText(f.message, ta)}{" "}
                <span className="text-(--text-secondary)/80">
                  ({f.article})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-xs text-teal-800 dark:text-teal-300">
          {t("Show the ODRL policy")}
        </summary>
        <OdrlJsonHighlighter
          data={policy}
          className="mt-2 max-h-64 rounded border border-(--border) p-2"
        />
      </details>

      {permits.length > 0 && (
        <div data-testid="offer-permit">
          <p className="flex items-center gap-1.5 text-xs font-medium text-(--text-secondary) uppercase tracking-wide">
            <ShieldCheck size={14} />
            {t("Your data permit binds the use as well")}
          </p>
          <ul className="mt-1 space-y-1 text-xs text-(--text-primary)">
            {permits.map((p) => (
              <li key={p.permitId}>
                <code>{p.permitId}</code>
                {p.datasetTitle ? ` · ${p.datasetTitle}` : ""}
                {p.purpose ? ` · ${words(p.purpose)}` : ""}
                {p.validUntil
                  ? ` · ${t("valid until {date}", {
                      date: p.validUntil.slice(0, 10),
                    })}`
                  : ""}
              </li>
            ))}
          </ul>
          {(scope?.permissions?.length ?? 0) > 0 && (
            <p className="mt-1 text-xs text-(--text-secondary)">
              {t("Permitted purposes: {list}", {
                list: (scope?.permissions ?? []).map(words).join(", "),
              })}
            </p>
          )}
          {(scope?.prohibitions?.length ?? 0) > 0 && (
            <p className="text-xs text-(--text-secondary)">
              {t("Forbidden: {list}", {
                list: (scope?.prohibitions ?? []).map(words).join(", "),
              })}
            </p>
          )}
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          data-testid="offer-terms-accept"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="mt-0.5 accent-layer2"
        />
        <span className="text-(--text-primary)">
          {t(
            "I have read these terms and agree to them on behalf of {consumer}.",
            { consumer: consumerName },
          )}
        </span>
      </label>
    </div>
  );
}
