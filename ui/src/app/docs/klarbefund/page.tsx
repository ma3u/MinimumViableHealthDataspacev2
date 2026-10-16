import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Smartphone } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { docsInSection, REPO_URL } from "@/lib/docs/published-docs";
import { INSURER_REPORT_PAGE } from "@/lib/docs/security-docs";

export const metadata = {
  title: "Klarbefund",
  description:
    "The iPhone app that turns a paper lab report into checkable values: the user guide and the developer guide, with screenshots, and the reports about its accuracy, security and regulatory status.",
};

/** Klarbefund's public TestFlight beta (ADR-050). */
const TESTFLIGHT_URL = "https://testflight.apple.com/join/ssADSXX6";

/** The reports about the app that live in the security section. */
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
        <ArrowLeft size={14} /> Back to Docs
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 inline-flex items-center gap-2">
          <Smartphone size={28} aria-hidden="true" /> Klarbefund
        </h1>
        <DocsLastUpdated page="/docs/klarbefund" />
        <p className="text-(--text-secondary) text-lg">
          Klarbefund is the iPhone app of this project. It scans a paper lab
          report, reads the values on the device, codes them with LOINC, keeps
          them encrypted on the phone and exports them as FHIR and OMOP, or
          sends them to the person&apos;s own record on the hub when they say
          so. Every screenshot shows invented data from the app&apos;s own demo
          dataset.
        </p>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10"
        data-testid="klarbefund-guides"
      >
        {guides.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/klarbefund/${d.slug}`}
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

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Reports about the app</h2>
        <p className="text-sm text-(--text-secondary) mb-3">
          Accuracy, data protection, the BSI TR-03161 objectives and the
          medical-device question are assessed in the security section:
        </p>
        <ul className="text-sm space-y-1.5">
          {REPORTS.map(([slug, label]) => (
            <li key={slug}>
              <Link
                href={`/docs/security/${slug}`}
                className="text-(--accent) underline"
              >
                {label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href={INSURER_REPORT_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              Report for health insurers, on one page <ExternalLink size={12} />
            </a>{" "}
            for a steering meeting.
          </li>
        </ul>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-3">Get the app</h2>
        <ul className="text-sm space-y-2 text-(--text-secondary)">
          <li>
            <a
              href={TESTFLIGHT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              Join the beta on TestFlight <ExternalLink size={12} />
            </a>{" "}
            on an iPhone with iOS 26 or later.
          </li>
          <li>
            <a
              href={`${REPO_URL}/tree/main/clients/ios`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              Source code <ExternalLink size={12} />
            </a>{" "}
            and the work tracked in{" "}
            <a
              href={`${REPO_URL}/issues/186`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline"
            >
              issue #186
            </a>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}
