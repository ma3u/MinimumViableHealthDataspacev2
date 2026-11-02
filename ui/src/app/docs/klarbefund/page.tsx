import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { ExternalA } from "@/components/docs/ExternalA";
import { PublishedDocCards } from "@/components/docs/PublishedDocCards";
import { docCards, docsInSection, REPO_URL } from "@/lib/docs/published-docs";
import { INSURER_REPORT_PAGE } from "@/lib/docs/security-docs";
import { T } from "@/lib/i18n/translate";

export const metadata = {
  title: "Klarbefund",
  description:
    "The iPhone app that turns a paper lab report into checkable values: the user guide and the developer guide, with screenshots, and the reports about its accuracy, security and regulatory status.",
};

/** Klarbefund's public TestFlight beta (ADR-050). */
const TESTFLIGHT_URL = "https://testflight.apple.com/join/ssADSXX6";

/** The reports about the app that live in the security section; the label
 *  is a key of docsCommon. */
const REPORTS = [
  ["klarbefund-self-assessment", "Self-assessment"],
  ["klarbefund-evidence", "Evidence"],
  ["report-for-health-insurers", "Report for health insurers"],
  ["threat-model-klarbefund", "Threat model"],
  ["klarbefund-run-on-mac", "Run the evidence on a Mac"],
] as const;

export default function KlarbefundDocsPage() {
  const guides = docsInSection("klarbefund");
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
          <Smartphone size={28} aria-hidden="true" />{" "}
          <T area="nav">{"Klarbefund"}</T>
        </h1>
        <DocsLastUpdated page="/docs/klarbefund" />
        <p className="text-(--text-secondary) text-lg">
          <T area="docsCommon">
            {
              "Klarbefund is the iPhone app of this project. It scans a paper lab report, reads the values on the device, codes them with LOINC, keeps them encrypted on the phone and exports them as FHIR and OMOP, or sends them to the person's own record on the hub when they say so. Every screenshot shows invented data from the app's own demo dataset."
            }
          </T>
        </p>
      </div>

      <PublishedDocCards docs={docCards(guides)} testId="klarbefund-guides" />

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">
          <T area="docsCommon">{"Reports about the app"}</T>
        </h2>
        <p className="text-sm text-(--text-secondary) mb-3">
          <T area="docsCommon">
            {
              "Accuracy, data protection, the BSI TR-03161 objectives and the medical-device question are assessed in the security section:"
            }
          </T>
        </p>
        <ul className="text-sm space-y-1.5">
          {REPORTS.map(([slug, label]) => (
            <li key={slug}>
              <Link
                href={`/docs/security/${slug}`}
                className="text-(--accent) underline"
              >
                <T area="docsCommon">{label}</T>
              </Link>
            </li>
          ))}
          <li>
            <T
              area="docsCommon"
              tags={{ a: <ExternalA href={INSURER_REPORT_PAGE} /> }}
            >
              {
                "<a>Report for health insurers, on one page</a> for a steering meeting."
              }
            </T>
          </li>
        </ul>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-3">
          <T area="docsCommon">{"Get the app"}</T>
        </h2>
        <ul className="text-sm space-y-2 text-(--text-secondary)">
          <li>
            <T
              area="docsCommon"
              tags={{ a: <ExternalA href={TESTFLIGHT_URL} /> }}
            >
              {
                "<a>Join the beta on TestFlight</a> on an iPhone with iOS 26 or later."
              }
            </T>
          </li>
          <li>
            <T
              area="docsCommon"
              tags={{
                a: <ExternalA href={`${REPO_URL}/tree/main/clients/ios`} />,
                issue: (
                  <a
                    href={`${REPO_URL}/issues/186`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--accent) underline"
                  />
                ),
              }}
            >
              {
                "<a>Source code</a> and the work tracked in <issue>issue #186</issue>."
              }
            </T>
          </li>
        </ul>
      </section>
    </div>
  );
}
