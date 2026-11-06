"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
  ListChecks,
  ScrollText,
  ShieldCheck,
  Target,
} from "lucide-react";
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
 * A purpose as a person says it: "EHDS Art. 53(1)(e) - scientific research"
 * becomes "Scientific research", an IRI its last segment in words. The full
 * value stays on the item's title.
 */
export function shortPurpose(value: string): string {
  const afterDash = value.split(/\s[-\u2013]\s/).pop() ?? value;
  const local = /^[a-z]+:\/\//i.test(afterDash)
    ? afterDash.split(/[/#]/).pop() ?? afterDash
    : afterDash;
  const plain = local
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1).toLowerCase();
}

/** One labelled list of the short view; nothing when the list is empty. */
function Glance({
  icon,
  label,
  items,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  items: { text: string; title?: string }[];
  testId: string;
}) {
  if (!items.length) return null;
  return (
    <div data-testid={testId} className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="flex items-start gap-1.5 text-xs font-medium text-(--text-secondary)">
        {icon}
        {label}
      </dt>
      <dd>
        <ul className="space-y-0.5 text-(--text-primary)">
          {items.map((i) => (
            <li key={i.text} title={i.title} className="first-letter:uppercase">
              {i.text}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

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
  agreed = false,
}: {
  policy: Record<string, unknown>;
  providerDid: string;
  providerName: string;
  consumerName: string;
  /** Absent for an agreement already signed: then there is nothing to tick. */
  accepted?: boolean;
  onAcceptedChange?: (accepted: boolean) => void;
  /** The policy of a signed agreement rather than of an offer. */
  agreed?: boolean;
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
  const glance = useMemo(() => {
    const pms = description.permissions;
    const purposes = Array.from(new Set(pms.flatMap((pm) => pm.purposes)));
    const time = pms.find((pm) => pm.timeLimit)?.timeLimit ?? null;
    return {
      purposes,
      time,
      conditions: pms.flatMap((pm) => pm.conditions),
      prohibitions: description.prohibitions.map((r) => r.label),
      duties: description.duties.map((r) => r.label),
    };
  }, [description]);
  const latestPermit = permits
    .map((p) => p.validUntil?.slice(0, 10) ?? "")
    .sort()
    .pop();

  const heading = (
    <div>
      <h3 className="flex items-center gap-2 font-semibold text-(--text-primary)">
        {agreed && (
          <ChevronRight
            size={14}
            className="shrink-0 transition-transform group-open:rotate-90"
          />
        )}
        <ScrollText size={16} />
        {agreed ? t("The terms you agreed to") : t("The terms you agree to")}
      </h3>
      <p className="text-xs text-(--text-secondary) mt-1">
        {agreed
          ? t(
              "{consumer} and {provider} signed this policy; it governs every use of the data.",
              { provider: providerName, consumer: consumerName },
            )
          : t(
              "{provider} offers this data under the policy below. Starting the negotiation means {consumer} accepts it.",
              { provider: providerName, consumer: consumerName },
            )}
      </p>
    </div>
  );

  const body = (
    <>
      <dl data-testid="offer-terms-glance" className="space-y-2">
        <Glance
          testId="terms-purposes"
          icon={<Target size={14} className="mt-0.5 shrink-0" />}
          label={t("Allowed for")}
          items={
            glance.purposes.length
              ? glance.purposes.map((v) => ({
                  text: shortPurpose(v),
                  title: v,
                }))
              : [{ text: t("Any purpose") }]
          }
        />
        <Glance
          testId="terms-time"
          icon={<Clock size={14} className="mt-0.5 shrink-0" />}
          label={t("For how long")}
          items={[
            {
              text: glance.time
                ? renderPolicyText(glance.time, ta)
                : t("No time limit"),
            },
          ]}
        />
        <Glance
          testId="terms-conditions"
          icon={<ListChecks size={14} className="mt-0.5 shrink-0" />}
          label={t("Only if")}
          items={glance.conditions.map((c) => ({
            text: renderPolicyText(c, ta),
          }))}
        />
        <Glance
          testId="terms-prohibitions"
          icon={<Ban size={14} className="mt-0.5 shrink-0" />}
          label={t("Not allowed")}
          items={glance.prohibitions.map((c) => ({
            text: renderPolicyText(c, ta),
          }))}
        />
        <Glance
          testId="terms-duties"
          icon={<CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
          label={t("You must")}
          items={glance.duties.map((c) => ({ text: renderPolicyText(c, ta) }))}
        />
      </dl>

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
          {t("Read the full terms")}
        </summary>
        <p className="mt-2 text-xs font-medium text-(--text-secondary) uppercase tracking-wide">
          {agreed
            ? t("The usage policy (ODRL)")
            : t("The offer's policy (ODRL)")}
        </p>
        <p
          data-testid="offer-policy-description"
          className="text-(--text-primary) mt-1"
        >
          {description.sentences.map((s) => renderPolicyText(s, ta)).join(" ")}
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-teal-800 dark:text-teal-300">
            {t("Show the ODRL policy")}
          </summary>
          <OdrlJsonHighlighter
            data={policy}
            className="mt-2 max-h-64 rounded border border-(--border) p-2"
          />
        </details>
      </details>

      {permits.length > 0 && (
        <div data-testid="offer-permit">
          <p className="flex items-center gap-1.5 text-xs font-medium text-(--text-secondary) uppercase tracking-wide">
            <ShieldCheck size={14} />
            {t("Your data permit binds the use as well")}
          </p>
          <p className="mt-1 text-(--text-primary)">
            {permits.length === 1
              ? t("You hold a data permit, valid until {date}.", {
                  date: latestPermit || "?",
                })
              : t(
                  "You hold {n} data permits; the latest is valid until {date}.",
                  { n: permits.length, date: latestPermit || "?" },
                )}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-teal-800 dark:text-teal-300">
              {t("Show the permits ({n})", { n: permits.length })}
            </summary>
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
          </details>
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

      {onAcceptedChange && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="offer-terms-accept"
            checked={!!accepted}
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
      )}
    </>
  );

  const frame =
    "mb-4 rounded-lg border border-(--border) bg-(--surface-2)/40 p-4 text-sm";

  // A signed agreement's terms are there to look up, not to read before
  // every transfer: they start folded, a click opens them.
  if (agreed) {
    return (
      <details data-testid="offer-terms" className={`group ${frame}`}>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {heading}
        </summary>
        <div className="mt-4 space-y-4">{body}</div>
      </details>
    );
  }

  return (
    <div data-testid="offer-terms" className={`space-y-4 ${frame}`}>
      {heading}
      {body}
    </div>
  );
}
