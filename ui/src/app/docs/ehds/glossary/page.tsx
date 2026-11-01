import Link from "next/link";
import { ArrowLeft, ExternalLink, Languages } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { REPO_URL } from "@/lib/docs/published-docs";
import terminology from "@/lib/i18n/ehds-terminology.json";

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
        <ArrowLeft size={14} /> Back to EHDS Regulation
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 inline-flex items-center gap-2">
          <Languages size={28} aria-hidden="true" /> EHDS Glossary
        </h1>
        <DocsLastUpdated page="/docs/ehds/glossary" />
        <p className="text-(--text-secondary) text-lg">
          The terms of Regulation (EU) 2025/327 the hub uses, in each language
          of its interface, as the Official Journal writes them. Every
          translation in the interface and in the dataset descriptions takes its
          term from this list; a variant the Regulation does not use fails the
          build.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-(--border)">
        <table className="w-full text-sm" data-testid="glossary">
          <thead className="bg-(--surface-2) text-left">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Article
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
                        not: {t.avoid[code].join(", ")}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-xl font-semibold mt-10 mb-3">Notes</h2>
      <ul className="list-disc pl-6 space-y-2 text-(--text-secondary)">
        {terms
          .filter((t) => t.note)
          .map((t) => (
            <li key={t.id}>
              <span className="font-medium text-(--text-primary)">{t.en}</span>:{" "}
              {t.note}
            </li>
          ))}
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-3">Sources</h2>
      <p className="text-(--text-secondary) mb-3">
        Checked on {terminology.source.checkedOn} by{" "}
        {terminology.source.checkedBy}.
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {LANGS.map(([code, name]) => (
          <li key={code}>
            <a
              href={terminology.source.languageVersions[code]}
              className="inline-flex items-center gap-1 text-(--accent) hover:underline"
            >
              The Regulation in {name} <ExternalLink size={12} />
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
