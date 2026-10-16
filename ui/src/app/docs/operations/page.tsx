import Link from "next/link";
import { Activity, ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { docsInSection, REPO_URL } from "@/lib/docs/published-docs";

export const metadata = {
  title: "Operations",
  description:
    "How to operate the hub and what it does under load: the operational guideline for hosting under the EHDS and the BSI standards, the Grafana dashboards with screenshots, the latest load, stress and spike results, the latest readiness assessment, and the runbook to repeat a run.",
};

/** The Grafana on Azure; a sign-in is required. */
const GRAFANA_URL = "https://grafana.ehds.mabu.red";

export default function OperationsDocsPage() {
  const docs = docsInSection("operations");
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
          <Activity size={28} aria-hidden="true" /> Operations
        </h1>
        <DocsLastUpdated page="/docs/operations" />
        <p className="text-(--text-secondary) text-lg">
          How the hub is operated and what it does under load. The operational
          guideline says which EHDS role runs which part and what the BSI
          standards ask of each; the dashboards page shows the three Grafana
          dashboards and how to read them; the load-test page holds the results
          of every load, stress and spike run, what each found and what changed
          because of it; the readiness assessment reads all of it against the
          Well-Architected Framework.
        </p>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10"
        data-testid="operations-docs"
      >
        {docs.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/operations/${d.slug}`}
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

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-3">Dashboards and runbook</h2>
        <ul className="text-sm space-y-2 text-(--text-secondary)">
          <li>
            <a
              href={`${GRAFANA_URL}/d/mvhd-load-test/load-and-stress-test`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              Load and stress test <ExternalLink size={12} />
            </a>{" "}
            on the platform&apos;s Grafana: what k6 is doing, the proxy and the
            containers, one run per <code>testid</code>. Sign-in required; the
            stack stops off hours.
          </li>
          <li>
            <a
              href={`${GRAFANA_URL}/d/mvhd-edc-dsp/edc-contracts-and-transfers`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              EDC contracts and transfers <ExternalLink size={12} />
            </a>
            : the negotiations and transfers a run drives through the
            connectors.
          </li>
          <li>
            <a
              href={`${REPO_URL}/blob/main/docs/knowledge/runbooks/load-and-stress-test.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              Runbook: load and stress test <ExternalLink size={12} />
            </a>
            , and the suite in{" "}
            <a
              href={`${REPO_URL}/tree/main/load-tests`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline"
            >
              load-tests/
            </a>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}
