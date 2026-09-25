"use client";

import { fetchApi } from "@/lib/api";
import { PURPOSE_LABELS, type Purpose } from "@/lib/permits";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, ShieldCheck, AlertCircle } from "lucide-react";

/**
 * What the health data access body tells the public about secondary use,
 * Regulation (EU) 2025/327 Art. 58(1): (a) the legal basis, (b) the
 * safeguards, (c) the rights of natural persons, (d) how to exercise them,
 * (e) the body and how to reach it, (f) who has access to which datasets and
 * why, (g) the results of the projects. No sign-in. Issue #206, M6.
 */

interface Body {
  name: string;
  did: string;
  country: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

interface Access {
  permitId: string;
  applicant: string | null;
  applicantCountry: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  holder: string | null;
  purpose: string | null;
  validFrom: string | null;
  validUntil: string | null;
  status: string;
  resultsDue: string | null;
}

interface Result {
  resultId: string;
  applicantName: string | null;
  datasetTitle: string | null;
  kind: string;
  title: string;
  summary: string | null;
  url: string | null;
  communicatedAt: string | null;
}

interface Information {
  generatedAt: string;
  bodies: Body[];
  access: Access[];
  results: Result[];
  optOut: { optedOut: number; patients: number };
  retention: { months: number };
  fees: {
    currency: string;
    body: { assessment: number; perDataset: number; spePerMonth: number };
    holder: { pseudonymised: number; anonymised: number };
    requestEur: number;
    reductions: Record<string, number>;
  };
}

function shortDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

function purposeLabel(p: string | null): string {
  if (!p) return "—";
  return (PURPOSE_LABELS as Record<string, string>)[p as Purpose] ?? p;
}

const REDUCTION_WORDS: Record<string, string> = {
  PUBLIC_SECTOR: "public sector bodies and Union institutions",
  ACADEMIC: "universities and academic researchers",
  MICRO_ENTERPRISE: "micro-enterprises",
  COMMERCIAL: "other legal persons",
};

function Item({
  letter,
  title,
  children,
  testId,
}: {
  letter: string;
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      data-testid={testId}
    >
      <h2 className="text-sm font-semibold mb-2 text-[var(--text-primary)]">
        ({letter}) {title}
      </h2>
      <div className="text-sm text-[var(--text-secondary)] space-y-2">
        {children}
      </div>
    </section>
  );
}

export default function InformationPage() {
  const [info, setInfo] = useState<Information | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/information")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body?.error) {
          throw new Error(body?.detail || body?.error || `HTTP ${r.status}`);
        }
        return body as Information;
      })
      .then(setInfo)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  const issued = (info?.access ?? []).filter((a) => a.status === "APPROVED");

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="page-header flex items-center gap-2">
            <Info size={28} />
            Secondary use of health data: what you should know
          </h1>
          <p className="text-[var(--text-secondary)] text-lg mt-1">
            Regulation (EU) 2025/327, Art. 58(1) · published by the health data
            access body, no sign-in needed
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm flex items-start gap-2 mb-6">
            <AlertCircle size={16} className="mt-0.5" />
            <span>
              The parts of this page that come from the graph are unavailable:{" "}
              {error}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <Item
            letter="a"
            title="The legal basis on which access is granted"
            testId="info-a"
          >
            <p>
              Electronic health data are made available for secondary use only
              for the purposes of Art. 53(1) of Regulation (EU) 2025/327: public
              health, policy making, official statistics, education, scientific
              research, the improvement of care, and the development of products
              and services in the field of health. Access is granted by a data
              permit of the health data access body (Art. 68) or, for anonymised
              statistics, by a decision on a health data request (Art. 69). The
              processing rests on Art. 6(1)(e) and Art. 9(2)(h), (i) and (j) of
              the GDPR, as Art. 53 and Art. 68 of the Regulation provide. Uses
              listed in Art. 54 are prohibited: no decisions detrimental to a
              person, no advertising, no insurance or credit decisions, no
              re-identification.
            </p>
          </Item>

          <Item
            letter="b"
            title="The technical and organisational measures protecting the data"
            testId="info-b"
          >
            <ul className="list-disc list-inside space-y-1">
              <li>
                Data are made available only in a secure processing environment
                (Art. 73); no record leaves it. Outputs are aggregate, and
                counts below five are suppressed.
              </li>
              <li>
                Data are pseudonymised by the trust centre before they reach the
                environment (Art. 66); anonymised where the purpose allows.
              </li>
              <li>
                Every access and activity in the environment is logged with the
                permit it ran under and kept at least{" "}
                {info?.retention.months ?? 12} months (Art. 73(1)(e)).
              </li>
              <li>
                A data user that does not comply is investigated and may lose
                its permit, be excluded or be fined (Art. 63, Art. 64); the
                measures are public.
              </li>
            </ul>
          </Item>

          <Item
            letter="c"
            title="Your rights in relation to secondary use"
            testId="info-c"
          >
            <ul className="list-disc list-inside space-y-1">
              <li>
                To opt out of the secondary use of your personal electronic
                health data, at any time and without giving reasons (Art. 71).
              </li>
              <li>
                To be informed, through this page, which data are used, by whom
                and for what (Art. 58(1)(f)), and what came of it (Art.
                58(1)(g)).
              </li>
              <li>
                The rights of Chapter III of the GDPR: information, access,
                rectification, erasure and objection, as they apply to
                pseudonymised data (Art. 15 to 22 GDPR).
              </li>
            </ul>
            {info && (
              <p data-testid="info-opt-out">
                Persons who have opted out on this platform:{" "}
                {info.optOut.optedOut} of {info.optOut.patients}.
              </p>
            )}
          </Item>

          <Item letter="d" title="How to exercise them" testId="info-d">
            <p>
              Sign in to your{" "}
              <Link
                href="/patient/research"
                className="font-bold text-[var(--accent)] hover:underline"
              >
                health record
              </Link>{" "}
              and use the secondary-use opt-out there; it takes effect at once
              for every future permit. For the GDPR rights, write to the access
              body named below or to the data holder that keeps your record; the
              body answers within one month (Art. 12(3) GDPR). A complaint may
              be lodged with the data protection supervisory authority.
            </p>
          </Item>

          <Item
            letter="e"
            title="The health data access body and how to reach it"
            testId="info-e"
          >
            {info && info.bodies.length > 0 ? (
              <ul className="space-y-1">
                {info.bodies.map((b) => (
                  <li key={b.did}>
                    <span className="font-medium text-[var(--text-primary)]">
                      {b.name}
                    </span>
                    {b.country ? ` (${b.country})` : ""}
                    {b.contactName || b.contactEmail
                      ? ` · ${[b.contactName, b.contactEmail]
                          .filter(Boolean)
                          .join(", ")}`
                      : ""}
                    <span className="font-mono text-xs"> · {b.did}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>MedReg DE (fictional), did:web:medreg.de:hdab</p>
            )}
            <p className="text-xs">
              All organisations on this platform are fictional; no real access
              body operates it.
            </p>
          </Item>

          <Item
            letter="f"
            title="Who has been granted access to which datasets, and for what purpose"
            testId="info-f"
          >
            {issued.length === 0 ? (
              <p>No data permit is in force.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg)] text-[var(--text-secondary)]">
                      <th className="text-left px-3 py-2 font-medium">
                        Data user
                      </th>
                      <th className="text-left px-3 py-2 font-medium">
                        Dataset
                      </th>
                      <th className="text-left px-3 py-2 font-medium">
                        Held by
                      </th>
                      <th className="text-left px-3 py-2 font-medium">
                        Purpose
                      </th>
                      <th className="text-left px-3 py-2 font-medium">Valid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issued.map((a) => (
                      <tr
                        key={a.permitId}
                        className="border-t border-[var(--border)]"
                        data-testid="access-row"
                      >
                        <td className="px-3 py-2 text-[var(--text-primary)]">
                          {a.applicant ?? "—"}
                          {a.applicantCountry ? ` (${a.applicantCountry})` : ""}
                        </td>
                        <td className="px-3 py-2">
                          {a.datasetTitle ?? a.datasetId ?? "—"}
                        </td>
                        <td className="px-3 py-2">{a.holder ?? "—"}</td>
                        <td className="px-3 py-2">{purposeLabel(a.purpose)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {shortDate(a.validFrom)} to {shortDate(a.validUntil)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs">
              Every application, decision, revocation and measure is on the{" "}
              <Link
                href="/permits"
                className="font-bold text-[var(--accent)] hover:underline"
              >
                public register
              </Link>
              .
            </p>
          </Item>

          <Item
            letter="g"
            title="The results or outcomes of the projects"
            testId="info-g"
          >
            {!info || info.results.length === 0 ? (
              <p>
                No data user has communicated results yet. A data user has 18
                months after the end of its processing to do so (Art. 61(4)).
              </p>
            ) : (
              <ul className="space-y-1">
                {info.results.map((r) => (
                  <li key={r.resultId} data-testid="info-result">
                    <span className="font-medium text-[var(--text-primary)]">
                      {r.url ? (
                        <a
                          href={r.url}
                          className="text-[var(--accent)] hover:underline"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}
                    </span>
                    {r.applicantName ? ` · ${r.applicantName}` : ""}
                    {r.datasetTitle ? ` · ${r.datasetTitle}` : ""}
                    {r.communicatedAt
                      ? ` · ${shortDate(r.communicatedAt)}`
                      : ""}
                    {r.summary ? (
                      <div className="text-xs">{r.summary}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Item>

          <section
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
            data-testid="info-fees"
          >
            <h2 className="text-sm font-semibold mb-2 text-[var(--text-primary)] flex items-center gap-2">
              <ShieldCheck size={14} />
              Fees, Art. 62
            </h2>
            <div className="text-sm text-[var(--text-secondary)] space-y-2">
              <p>
                Fees cover the cost of making the data available and are split
                between the access body and the data holder. The schedule is the
                demo&apos;s own and fictional.
              </p>
              {info && (
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>
                    Access body: assessment {info.fees.body.assessment}{" "}
                    {info.fees.currency}, {info.fees.body.perDataset} per
                    dataset, {info.fees.body.spePerMonth} per month of the
                    secure processing environment.
                  </li>
                  <li>
                    Data holder: {info.fees.holder.pseudonymised}{" "}
                    {info.fees.currency} per pseudonymised extraction,{" "}
                    {info.fees.holder.anonymised} per anonymised one.
                  </li>
                  <li>
                    Health data request (Art. 69): {info.fees.requestEur}{" "}
                    {info.fees.currency}.
                  </li>
                  <li>
                    Reduced fees (Art. 62(3)):{" "}
                    {Object.entries(info.fees.reductions)
                      .filter(([, r]) => r > 0)
                      .map(
                        ([c, r]) =>
                          `${Math.round(r * 100)}% off for ${
                            REDUCTION_WORDS[c] ?? c
                          }`,
                      )
                      .join("; ")}
                    .
                  </li>
                </ul>
              )}
            </div>
          </section>
        </div>

        <p className="mt-6 text-xs text-[var(--text-secondary)]">
          See also the{" "}
          <Link
            href="/permits"
            className="text-[var(--accent)] hover:underline"
          >
            public register
          </Link>{" "}
          (Art. 57(1)(j)) and the{" "}
          <Link
            href="/activity-report"
            className="text-[var(--accent)] hover:underline"
          >
            activity report
          </Link>{" "}
          (Art. 59).
          {info?.generatedAt
            ? ` Read on ${info.generatedAt.slice(0, 19).replace("T", " ")} UTC.`
            : ""}
        </p>
      </div>
    </div>
  );
}
