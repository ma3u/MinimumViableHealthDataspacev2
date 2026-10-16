import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import {
  INSURER_REPORT_PAGE,
  REPO_URL,
  securityDocs,
} from "@/lib/docs/security-docs";

export const metadata = {
  title: "Security and Data Protection",
  description:
    "The security test report, threat models, the Klarbefund self-assessment and evidence, the report for health insurers and the bills of materials, published from the repository.",
};

const RUN_AGAIN = [
  [
    "scripts/security/generate-sbom.sh --check",
    "the bills still match the lockfiles",
  ],
  [
    "scripts/security/scan-repo.sh",
    "grype, npm audit, trivy, gitleaks, semgrep, hadolint, shellcheck",
  ],
  [
    "scripts/security/check-hub-blackbox.sh",
    "48 anonymous checks of the live hub (exits 3 off hours)",
  ],
  [
    "cd clients/ios && swift test --filter SecurityPostureTests",
    "the app's build-setting tests",
  ],
];

export default function SecurityDocsPage() {
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
          <ShieldCheck size={28} aria-hidden="true" /> Security and Data
          Protection
        </h1>
        <DocsLastUpdated page="/docs/security" />
        <p className="text-(--text-secondary) text-lg">
          Security and data protection are tested by the project itself with
          tools anyone can run on the repository, and every finding is either
          fixed or named as open. The test of 2026-10-15 found ten findings, F1
          to F10: after the fixes nine are closed and one is reviewed and
          accepted (F3, the published development default key of the local
          compose stack; Azure takes its keys from Vault). None of this is an
          independent penetration test or a certification.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {securityDocs.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/security/${d.slug}`}
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
        <h2 className="text-xl font-semibold mb-3">Elsewhere</h2>
        <ul className="text-sm space-y-2 text-(--text-secondary)">
          <li>
            <a
              href={INSURER_REPORT_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              Report for health insurers, on one page <ExternalLink size={12} />
            </a>{" "}
            for a steering meeting; the long form is the published report above.
          </li>
          <li>
            <a
              href={`${REPO_URL}/actions/workflows/security-scan.yml`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline inline-flex items-center gap-1"
            >
              Security scans in CI <ExternalLink size={12} />
            </a>
            : grype over the bills and trivy over the images on every push;
            CodeQL for TypeScript and Swift in their own workflows; results in
            the{" "}
            <a
              href={`${REPO_URL}/security`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline"
            >
              Security tab
            </a>
            .
          </li>
          <li>
            Decisions:{" "}
            <a
              href={`${REPO_URL}/blob/main/docs/ADRs/ADR-011-security-testing.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline"
            >
              ADR-011
            </a>{" "}
            (the testing strategy) and{" "}
            <a
              href={`${REPO_URL}/blob/main/docs/ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) underline"
            >
              ADR-060
            </a>{" "}
            (the app lock; why certificate pinning and jailbreak detection were
            declined).
          </li>
        </ul>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-3">Run it again</h2>
        <div className="border border-(--border) rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {RUN_AGAIN.map(([cmd, what]) => (
                <tr
                  key={cmd}
                  className="border-b border-(--border) last:border-0"
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    <code className="text-xs">{cmd}</code>
                  </td>
                  <td className="px-4 py-2 text-(--text-secondary)">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
