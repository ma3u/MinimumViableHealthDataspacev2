import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Scale } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { docsInSection, REPO_URL } from "@/lib/docs/published-docs";

export const metadata = {
  title: "EHDS Regulation",
  description:
    "What the integration hub implements of the European Health Data Space Regulation, (EU) 2025/327, article by article, with the evidence and the gaps, and how the 2022 proposal's numbers map to the adopted ones.",
};

/** The Regulation on EUR-Lex, the authoritative text. */
const EUR_LEX =
  "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025R0327";

/** The decisions an EHDS reader is most likely to ask about. */
const DECISIONS = [
  [
    "ADR-062",
    "ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md",
    "The Art. 71 opt-out from secondary use",
  ],
  [
    "ADR-063",
    "ADR-063-healthdcat-ap-release-8-and-its-namespace.md",
    "HealthDCAT-AP Release 8 for Art. 77 dataset descriptions",
  ],
  [
    "ADR-044",
    "ADR-044-every-api-route-needs-a-session.md",
    "Every API route needs a session",
  ],
  [
    "ADR-045",
    "ADR-045-observability-and-regulatory-audit-trail.md",
    "The audit trail behind Art. 73(1)(e)",
  ],
] as const;

export default function EhdsDocsPage() {
  const docs = docsInSection("ehds");
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
      >
        <ArrowLeft size={14} /> Back to Docs
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 inline-flex items-center gap-2">
          <Scale size={28} aria-hidden="true" /> EHDS Regulation
        </h1>
        <DocsLastUpdated page="/docs/ehds" />
        <p className="text-(--text-secondary) text-lg">
          The European Health Data Space is Regulation (EU) 2025/327. This
          section says what the integration hub implements of it, article by
          article: the page, the route or the file that does it, the test that
          shows it, and where it falls short, with the issue that tracks the
          gap. Article numbers are the adopted ones; older material in the
          repository may still cite the 2022 proposal, and the numbering page
          maps one to the other.
        </p>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10"
        data-testid="ehds-docs"
      >
        {docs.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/ehds/${d.slug}`}
            className="flex flex-col border border-(--border) rounded-xl p-5 hover:border-indigo-500/50 transition-colors group"
          >
            <span className="font-semibold mb-2 text-indigo-700 dark:text-indigo-400">
              {d.title}
            </span>
            <span className="text-sm text-(--text-secondary) mb-3 flex-1">
              {d.summary}
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-(--accent) group-hover:underline mt-auto">
              Read <ArrowRight size={14} />
            </span>
          </Link>
        ))}
      </div>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          The text and the decisions
        </h2>
        <ul className="text-sm space-y-2 text-(--text-secondary)">
          <li>
            <a
              href={EUR_LEX}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              Regulation (EU) 2025/327 on EUR-Lex <ExternalLink size={12} />
            </a>
            , the authoritative text.
          </li>
          {DECISIONS.map(([id, file, what]) => (
            <li key={id}>
              <a
                href={`${REPO_URL}/blob/main/docs/ADRs/${file}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--accent) underline inline-flex items-center gap-1"
              >
                {id} <ExternalLink size={12} />
              </a>{" "}
              {what}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">See it on the platform</h2>
        <ul className="text-sm space-y-2 text-(--text-secondary) list-disc list-inside">
          <li>
            <Link href="/information" className="text-(--accent) underline">
              Information to natural persons
            </Link>{" "}
            (Art. 58), with the count of persons who opted out (Art. 71).
          </li>
          <li>
            <Link href="/compliance" className="text-(--accent) underline">
              The access body&apos;s desk
            </Link>{" "}
            (Art. 57, 67 to 69): applications, the decision clock, permits.
          </li>
          <li>
            <Link
              href="/patient/research"
              className="text-(--accent) underline"
            >
              The person&apos;s opt-out
            </Link>{" "}
            (Art. 71) and study consents.
          </li>
        </ul>
      </section>
    </div>
  );
}
