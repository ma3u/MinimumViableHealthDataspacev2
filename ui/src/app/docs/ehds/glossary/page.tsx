import Link from "next/link";
import { ArrowLeft, ExternalLink, Languages } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { REPO_URL } from "@/lib/docs/published-docs";
import terminology from "@/lib/i18n/ehds-terminology.json";
import { T } from "@/lib/i18n/translate";

export const metadata = {
  title: "EHDS Glossary",
  description:
    "The terms of Regulation (EU) 2025/327 the hub uses, in English, German, French, Dutch and Spanish, as the Official Journal writes them, with the variants it avoids.",
};

const LANGS = [
  ["en", "English"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["nl", "Nederlands"],
  ["es", "Español"],
] as const;

type Term = {
  id: string;
  article: string;
  note?: string;
  avoid?: Partial<Record<string, string[]>>;
} & Record<(typeof LANGS)[number][0], string>;

export default function EhdsGlossaryPage() {
  const terms = terminology.terms as unknown as Term[];
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <Link
        href="/docs/ehds"
        className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
      >
        <ArrowLeft size={14} />{" "}
        <T area="docsCommon">{"Back to EHDS Regulation"}</T>
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 inline-flex items-center gap-2">
          <Languages size={28} aria-hidden="true" />{" "}
          <T area="docsCommon">{"EHDS Glossary"}</T>
        </h1>
        <DocsLastUpdated page="/docs/ehds/glossary" />
        <p className="text-(--text-secondary) text-lg">
          <T area="docsCommon">
            {
              "The terms of Regulation (EU) 2025/327 the hub uses, in each language of its interface, as the Official Journal writes them. Every translation in the interface and in the dataset descriptions takes its term from this list; a variant the Regulation does not use fails the build."
            }
          </T>
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-(--border)">
        <table className="w-full text-sm" data-testid="glossary">
          <thead className="bg-(--surface-2) text-left">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                <T area="docsCommon">{"Article"}</T>
              </th>
              {LANGS.map(([code, name]) => (
                <th
                  key={code}
                  scope="col"
                  lang={code}
                  className="px-3 py-2 font-semibold"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr
                key={t.id}
                id={t.id}
                className="border-t border-(--border) align-top"
              >
                <td className="px-3 py-2 whitespace-nowrap text-(--text-secondary)">
                  {t.article}
                </td>
                {LANGS.map(([code]) => (
                  <td key={code} lang={code} className="px-3 py-2">
                    <span className="font-medium">{t[code]}</span>
                    {t.avoid?.[code] && (
                      <span className="block text-xs text-(--text-secondary)">
                        <T
                          area="docsCommon"
                          vars={{ terms: t.avoid[code].join(", ") }}
                        >
                          {"not: {terms}"}
                        </T>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-xl font-semibold mt-10 mb-3">
        <T area="docsCommon">{"Notes"}</T>
      </h2>
      <ul className="list-disc pl-6 space-y-2 text-(--text-secondary)">
        {terms
          .filter((t) => t.note)
          .map((t) => (
            <li key={t.id} lang="en">
              <span className="font-medium text-(--text-primary)">{t.en}</span>:{" "}
              {t.note}
            </li>
          ))}
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-3">
        <T area="docsCommon">{"Sources"}</T>
      </h2>
      <p className="text-(--text-secondary) mb-3">
        <T
          area="docsCommon"
          vars={{
            date: terminology.source.checkedOn,
            who: terminology.source.checkedBy,
          }}
        >
          {"Checked on {date} by {who}."}
        </T>
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {LANGS.map(([code, name]) => (
          <li key={code}>
            <a
              href={terminology.source.languageVersions[code]}
              className="inline-flex items-center gap-1 text-(--accent) hover:underline"
            >
              <T area="docsCommon" vars={{ language: name }}>
                {"The Regulation in {language}"}
              </T>{" "}
              <ExternalLink size={12} />
            </a>
          </li>
        ))}
        <li>
          <a
            href={`${REPO_URL}/blob/main/ui/src/lib/i18n/ehds-terminology.json`}
            className="inline-flex items-center gap-1 text-(--accent) hover:underline"
          >
            ehds-terminology.json <ExternalLink size={12} />
          </a>
        </li>
      </ul>
    </div>
  );
}
