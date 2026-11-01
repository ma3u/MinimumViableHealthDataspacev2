"use client";

import { fetchApi } from "@/lib/api";
import type {
  Jurisdiction,
  JurisdictionsResponse,
  Milestone,
} from "@/lib/jurisdictions";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink, Loader2, Scale } from "lucide-react";

/**
 * How six member states implement the secondary use of Regulation (EU)
 * 2025/327 (#782). The Regulation is the same everywhere; the access body,
 * the national law it acts under, the way a person objects, the fees and the
 * dates differ. The laws and legal roles are real, the organisations on the
 * hub fictional.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  fr: "French",
  nl: "Dutch",
  es: "Spanish",
  en: "English",
  ca: "Catalan",
  eu: "Basque",
  gl: "Galician",
};

const LAW_STATUS: Record<string, string> = {
  IN_FORCE: "in force",
  BILL: "bill",
  DRAFT: "draft",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 sm:gap-3 py-2 border-b border-(--border) last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-(--text-secondary)">
        {label}
      </dt>
      <dd className="text-sm text-(--text-primary)">{children}</dd>
    </div>
  );
}

function MilestoneList({ milestones }: { milestones: Milestone[] }) {
  return (
    <ol className="space-y-1">
      {milestones.map((m) => (
        <li key={m.milestoneId} className="flex gap-3">
          <span className="font-mono text-xs w-24 shrink-0 pt-0.5">
            {m.date}
          </span>
          <span>
            {m.label}
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-(--text-secondary)">
              {m.scope === "EU" ? "EU" : "national"}
              {m.status === "PLANNED" ? ", planned" : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Profile({ j }: { j: Jurisdiction }) {
  const lang = j.languages[0];
  return (
    <section
      id={j.code.toLowerCase()}
      data-testid={`jurisdiction-${j.code}`}
      className="rounded-xl border border-(--border) bg-(--surface) p-5 scroll-mt-20"
    >
      <h2 className="text-lg font-bold text-(--text-primary) flex items-baseline gap-2">
        <span className="font-mono text-sm px-2 py-0.5 rounded-sm bg-(--surface-2)">
          {j.code}
        </span>
        {j.name}
        {j.nameNative !== j.name && (
          <span
            lang={lang}
            className="text-sm font-normal text-(--text-secondary)"
          >
            {j.nameNative}
          </span>
        )}
      </h2>
      <p className="text-sm text-(--text-secondary) mt-2">{j.summary}</p>

      <dl className="mt-4">
        <Field label="Access body (role)">
          <span lang={lang}>{j.accessBodyRole}</span>
          {j.accessBodyRoleEn !== j.accessBodyRole && (
            <span className="text-(--text-secondary)">
              {" "}
              ({j.accessBodyRoleEn})
            </span>
          )}
          <p className="text-xs text-(--text-secondary) mt-1">
            {j.designationStatus}
          </p>
        </Field>
        <Field label="On the hub">
          {j.accessBodies.length > 0 ? (
            j.accessBodies.map((b) => (
              <span key={b.participantId} className="mr-3">
                {b.name}{" "}
                <span className="text-xs text-(--text-secondary)">
                  (fictional access body)
                </span>
              </span>
            ))
          ) : (
            <span className="text-(--text-secondary)">
              No access body of this country on the hub yet.
            </span>
          )}
          {j.participants.length > 0 && (
            <p className="text-xs text-(--text-secondary) mt-1">
              Also under it: {j.participants.map((p) => p.name).join(", ")}
            </p>
          )}
        </Field>
        <Field label="National legal basis">
          <ul className="space-y-1.5">
            {j.laws.map((l) => (
              <li key={l.lawId}>
                {l.url ? (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    lang={lang}
                    className="text-(--accent) underline"
                  >
                    {l.title}
                  </a>
                ) : (
                  <span lang={lang}>{l.title}</span>
                )}
                {l.citation && (
                  <span className="text-(--text-secondary)">
                    , {l.citation}
                  </span>
                )}
                <span className="block text-xs text-(--text-secondary)">
                  {l.titleEn}
                  {" · "}
                  {LAW_STATUS[l.status] ?? l.status}
                </span>
              </li>
            ))}
          </ul>
        </Field>
        <Field label="Objecting (Art. 71)">{j.optOutModel}</Field>
        <Field label="Fees (Art. 62)">{j.fees}</Field>
        <Field label="Languages">
          {j.languages.map((l) => LANGUAGE_NAMES[l] ?? l).join(", ")}
        </Field>
        <Field label="Timeline">
          <MilestoneList milestones={j.milestones} />
        </Field>
        <Field label="Sources">
          <ul className="space-y-0.5">
            {j.sources.map((s) => (
              <li key={s} className="text-xs break-all">
                <a
                  href={s}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-(--accent) underline inline-flex items-center gap-1"
                >
                  {s}
                  <ExternalLink size={10} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </Field>
      </dl>
    </section>
  );
}

export default function JurisdictionsPage() {
  const [data, setData] = useState<JurisdictionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/jurisdictions")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body?.error) {
          throw new Error(body?.error || `HTTP ${r.status}`);
        }
        return body as JurisdictionsResponse;
      })
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="page-header flex items-center gap-2">
            <Scale size={28} />
            National implementation of the EHDS
          </h1>
          <p className="text-(--text-secondary) text-lg mt-1">
            One Regulation, (EU) 2025/327, and six ways of putting it to work:
            who grants access, under which national law, how a person objects,
            what access costs and when it applies.
          </p>
        </div>

        <div className="rounded-lg border border-(--border) bg-(--surface-2) p-4 text-sm text-(--text-secondary) mb-6 space-y-1">
          <p>
            The laws and the legal roles are real and linked to their official
            sources. The organisations on this hub are fictional; the real
            institution that holds each role is not named. This is an overview
            for demonstration, not legal advice.
          </p>
          {data?.reviewedOn && (
            <p>
              Checked against the sources on{" "}
              <span className="font-mono">{data.reviewedOn}</span>. National
              implementation is moving; a bill can change before it passes.
            </p>
          )}
          <p>
            The dataset descriptions in the{" "}
            <Link href="/catalog" className="text-(--accent) underline">
              catalogue
            </Link>{" "}
            are available in German, and some in French and Dutch.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-(--border) bg-(--surface) p-4 text-sm flex items-start gap-2 mb-6">
            <AlertCircle size={16} className="mt-0.5" />
            <span>The national profiles are unavailable: {error}</span>
          </div>
        )}

        {!data && !error && (
          <div className="flex items-center gap-2 text-(--text-secondary)">
            <Loader2 size={16} className="animate-spin" />
            Loading…
          </div>
        )}

        {data && (
          <>
            <nav aria-label="Countries" className="flex flex-wrap gap-2 mb-6">
              {data.jurisdictions.map((j) => (
                <a
                  key={j.code}
                  href={`#${j.code.toLowerCase()}`}
                  className="px-3 py-1 rounded-full text-xs font-bold border border-(--border-ui) bg-(--surface-card) text-(--text-primary) hover:border-(--accent)"
                >
                  {j.code} · {j.name}
                </a>
              ))}
            </nav>
            <div className="grid grid-cols-1 gap-6">
              {data.jurisdictions.map((j) => (
                <Profile key={j.code} j={j} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
