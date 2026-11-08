import Link from "next/link";
import { Activity, ArrowLeft } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { ExternalA } from "@/components/docs/ExternalA";
import { PublishedDocCards } from "@/components/docs/PublishedDocCards";
import { docCards, docsInSection, REPO_URL } from "@/lib/docs/published-docs";
import { T } from "@/lib/i18n/translate";

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
        <ArrowLeft size={14} /> <T area="docsCommon">{"Back to Docs"}</T>
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 inline-flex items-center gap-2">
          <Activity size={28} aria-hidden="true" />{" "}
          <T area="nav">{"Operations"}</T>
        </h1>
        <DocsLastUpdated page="/docs/operations" />
        <p className="text-(--text-secondary) text-lg">
          <T
            area="docsCommon"
            tags={{
              e: (
                <ExternalA href="https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng" />
              ),
              c5: (
                <ExternalA href="https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/ComplianceControlsCatalogue/2020/C5_2020.pdf?__blob=publicationFile&v=3" />
              ),
              gs: (
                <ExternalA href="https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/it-grundschutz_node.html" />
              ),
              tls: <ExternalA href="https://www.bsi.bund.de/dok/TR-02102" />,
              app: <ExternalA href="https://www.bsi.bund.de/dok/TR-03161" />,
              waf: (
                <ExternalA href="https://learn.microsoft.com/en-us/azure/well-architected/" />
              ),
            }}
          >
            {
              "How the hub is operated and what it does under load. The operational guideline says which <e>EHDS</e> role runs which part and what the BSI standards (<c5>C5</c5>, <gs>IT-Grundschutz</gs>, <tls>TR-02102</tls>, <app>TR-03161</app>) ask of each; the dashboards page shows the three Grafana dashboards and how to read them; the load-test page holds the results of every load, stress and spike run, what each found and what changed because of it; the readiness assessment reads all of it against the <waf>Well-Architected Framework</waf>."
            }
          </T>
        </p>
      </div>

      <PublishedDocCards docs={docCards(docs)} testId="operations-docs" />

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-3">
          <T area="docsCommon">{"Dashboards and runbook"}</T>
        </h2>
        <ul className="text-sm space-y-2 text-(--text-secondary)">
          <li>
            <T
              area="docsCommon"
              tags={{
                a: (
                  <ExternalA
                    href={`${GRAFANA_URL}/d/mvhd-load-test/load-and-stress-test`}
                  />
                ),
                code: <code />,
                k6: <ExternalA href="https://grafana.com/docs/k6/latest/" />,
              }}
            >
              {
                "<a>Load and stress test</a> on the platform's Grafana: what <k6>k6</k6> is doing, the proxy and the containers, one run per <code>testid</code>. Sign-in required; the stack stops off hours."
              }
            </T>
          </li>
          <li>
            <T
              area="docsCommon"
              tags={{
                a: (
                  <ExternalA
                    href={`${GRAFANA_URL}/d/mvhd-edc-dsp/edc-contracts-and-transfers`}
                  />
                ),
              }}
            >
              {
                "<a>EDC contracts and transfers</a>: the negotiations and transfers a run drives through the connectors."
              }
            </T>
          </li>
          <li>
            <T
              area="docsCommon"
              tags={{
                a: (
                  <ExternalA
                    href={`${REPO_URL}/blob/main/docs/knowledge/runbooks/load-and-stress-test.md`}
                  />
                ),
                dir: (
                  <a
                    href={`${REPO_URL}/tree/main/load-tests`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--accent) underline"
                  />
                ),
              }}
            >
              {
                "<a>Runbook: load and stress test</a>, and the suite in <dir>load-tests/</dir>."
              }
            </T>
          </li>
        </ul>
      </section>
    </div>
  );
}
