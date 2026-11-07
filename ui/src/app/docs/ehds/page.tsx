import Link from "next/link";
import { ArrowLeft, ArrowRight, Languages, Scale } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { ExternalA } from "@/components/docs/ExternalA";
import { PublishedDocCards } from "@/components/docs/PublishedDocCards";
import { docCards, docsInSection, REPO_URL } from "@/lib/docs/published-docs";
import { T } from "@/lib/i18n/translate";

export const metadata = {
  title: "EHDS Regulation",
  description:
    "What the integration hub implements of the European Health Data Space Regulation, (EU) 2025/327, article by article, with the evidence and the gaps, and how the 2022 proposal's numbers map to the adopted ones.",
};

/** The Regulation on EUR-Lex, the authoritative text, by its ELI: an
 *  article is #art_N, a paragraph #NNN.PPP (Art. 73(1) is #073.001). */
const EUR_LEX = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";
const art = (anchor: string) => <ExternalA href={`${EUR_LEX}#${anchor}`} />;

/** The decisions an EHDS reader is most likely to ask about; the third
 *  entry is a key of docsCommon, its parts in <tag>...</tag> linked by the
 *  fourth. */
const DECISIONS = [
  [
    "ADR-062",
    "ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md",
    "The <a71>Art. 71</a71> opt-out from secondary use",
    { a71: art("art_71") },
  ],
  [
    "ADR-063",
    "ADR-063-healthdcat-ap-release-8-and-its-namespace.md",
    "<r8>HealthDCAT-AP Release 8</r8> for <a77>Art. 77</a77> dataset descriptions",
    {
      r8: (
        <ExternalA href="https://data.health.europa.eu/healthdcat-ap/releases/release-8/" />
      ),
      a77: art("art_77"),
    },
  ],
  [
    "ADR-044",
    "ADR-044-every-api-route-needs-a-session.md",
    "Every API route needs a session",
    undefined,
  ],
  [
    "ADR-045",
    "ADR-045-observability-and-regulatory-audit-trail.md",
    "The audit trail behind <a73>Art. 73(1)(e)</a73>",
    { a73: art("073.001") },
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
        <ArrowLeft size={14} /> <T area="docsCommon">{"Back to Docs"}</T>
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 inline-flex items-center gap-2">
          <Scale size={28} aria-hidden="true" />{" "}
          <T area="nav">{"EHDS Regulation"}</T>
        </h1>
        <DocsLastUpdated page="/docs/ehds" />
        <p className="text-(--text-secondary) text-lg">
          <T
            area="docsCommon"
            tags={{
              e: <ExternalA href={EUR_LEX} />,
              p: (
                <ExternalA href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52022PC0197" />
              ),
              n: (
                <Link
                  href="/docs/ehds/article-numbering"
                  className="text-(--accent) underline"
                />
              ),
            }}
          >
            {
              "The European Health Data Space is <e>Regulation (EU) 2025/327</e>. This section says what the integration hub implements of it, article by article: the page, the route or the file that does it, the test that shows it, and where it falls short, with the issue that tracks the gap. Article numbers are the adopted ones; older material in the repository may still cite the <p>2022 proposal</p>, and the <n>numbering page</n> maps one to the other."
            }
          </T>
        </p>
        <Link
          href="/docs/ehds/glossary"
          className="inline-flex items-center gap-1 mt-3 text-sm text-(--accent) hover:underline"
        >
          <Languages size={14} aria-hidden="true" />{" "}
          <T area="docsCommon">
            {"EHDS Glossary: the Regulation's terms in five languages"}
          </T>{" "}
          <ArrowRight size={14} />
        </Link>
      </div>

      <PublishedDocCards docs={docCards(docs)} testId="ehds-docs" />

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          <T area="docsCommon">{"The text and the decisions"}</T>
        </h2>
        <ul className="text-sm space-y-2 text-(--text-secondary)">
          <li>
            <T area="docsCommon" tags={{ a: <ExternalA href={EUR_LEX} /> }}>
              {
                "<a>Regulation (EU) 2025/327 on EUR-Lex</a>, the authoritative text."
              }
            </T>
          </li>
          {DECISIONS.map(([id, file, what, tags]) => (
            <li key={id}>
              <ExternalA href={`${REPO_URL}/blob/main/docs/ADRs/${file}`}>
                {id}
              </ExternalA>{" "}
              <T area="docsCommon" tags={tags}>
                {what}
              </T>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">
          <T area="docsCommon">{"See it on the platform"}</T>
        </h2>
        <ul className="text-sm space-y-2 text-(--text-secondary) list-disc list-inside">
          <li>
            <T
              area="docsCommon"
              tags={{
                a: (
                  <Link
                    href="/information"
                    className="text-(--accent) underline"
                  />
                ),
                a58: art("art_58"),
                a71: art("art_71"),
              }}
            >
              {
                "<a>Information to natural persons</a> (<a58>Art. 58</a58>), with the count of persons who opted out (<a71>Art. 71</a71>)."
              }
            </T>
          </li>
          <li>
            <T
              area="docsCommon"
              tags={{
                a: (
                  <Link
                    href="/compliance"
                    className="text-(--accent) underline"
                  />
                ),
                a57: art("art_57"),
                a67: art("art_67"),
                a69: art("art_69"),
              }}
            >
              {
                "<a>The access body's desk</a> (<a57>Art. 57</a57>, <a67>67</a67> to <a69>69</a69>): applications, the decision clock, permits."
              }
            </T>
          </li>
          <li>
            <T
              area="docsCommon"
              tags={{
                a: (
                  <Link
                    href="/patient/research"
                    className="text-(--accent) underline"
                  />
                ),
                a71: art("art_71"),
              }}
            >
              {
                "<a>The person's opt-out</a> (<a71>Art. 71</a71>) and study consents."
              }
            </T>
          </li>
        </ul>
      </section>
    </div>
  );
}
