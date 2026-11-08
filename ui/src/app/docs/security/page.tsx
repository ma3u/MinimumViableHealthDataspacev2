import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { ExternalA } from "@/components/docs/ExternalA";
import { PublishedDocCards } from "@/components/docs/PublishedDocCards";
import { docCards } from "@/lib/docs/published-docs";
import {
  INSURER_REPORT_PAGE,
  REPO_URL,
  securityDocs,
} from "@/lib/docs/security-docs";
import { T } from "@/lib/i18n/translate";

export const metadata = {
  title: "Security and Data Protection",
  description:
    "The security test report, threat models, the Klarbefund self-assessment and evidence, the report for health insurers and the bills of materials, published from the repository.",
};

/** The command, what it checks (a key of docsCommon) and the file it runs. */
const RUN_AGAIN = [
  [
    "scripts/security/generate-sbom.sh --check",
    "the bills still match the lockfiles",
    "scripts/security/generate-sbom.sh",
  ],
  [
    "scripts/security/scan-repo.sh",
    "grype, npm audit, trivy, gitleaks, semgrep, hadolint, shellcheck",
    "scripts/security/scan-repo.sh",
  ],
  [
    "scripts/security/check-hub-blackbox.sh",
    "48 anonymous checks of the live hub (exits 3 off hours)",
    "scripts/security/check-hub-blackbox.sh",
  ],
  [
    "cd clients/ios && swift test --filter SecurityPostureTests",
    "the app's build-setting tests",
    "clients/ios/Tests/SharedTests/SecurityPostureTests.swift",
  ],
];

export default function SecurityDocsPage() {
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
          <ShieldCheck size={28} aria-hidden="true" />{" "}
          <T area="nav">{"Security and Data Protection"}</T>
        </h1>
        <DocsLastUpdated page="/docs/security" />
        <p className="text-(--text-secondary) text-lg">
          <T
            area="docsCommon"
            tags={{
              a: <Link href="/docs/operations" className="underline" />,
              r: (
                <Link
                  href="/docs/security/security-test-report"
                  className="underline"
                />
              ),
              v: (
                <ExternalA
                  href={`${REPO_URL}/blob/main/docs/ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md`}
                />
              ),
            }}
          >
            {
              "Security and data protection are tested by the project itself with tools anyone can run on the repository, and every finding is either fixed or named as open. <r>The test of 2026-10-15</r> found ten findings, F1 to F10: after the fixes nine are closed and one is reviewed and accepted (F3, the published development default key of the local compose stack; Azure takes its keys from <v>Vault</v>). None of this is an independent penetration test or a certification. How the platform is operated for real, role by role, is the operational guideline in the <a>Operations section</a>."
            }
          </T>
        </p>
      </div>

      <PublishedDocCards docs={docCards(securityDocs)} />

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">
          <T area="docsCommon">{"Elsewhere"}</T>
        </h2>
        <ul className="text-sm space-y-2 text-(--text-secondary)">
          <li>
            <T
              area="docsCommon"
              tags={{ a: <ExternalA href={INSURER_REPORT_PAGE} /> }}
            >
              {
                "<a>Report for health insurers, on one page</a> for a steering meeting; the long form is the published report above."
              }
            </T>
          </li>
          <li>
            <T
              area="docsCommon"
              tags={{
                a: (
                  <ExternalA
                    href={`${REPO_URL}/actions/workflows/security-scan.yml`}
                  />
                ),
                tab: (
                  <a
                    href={`${REPO_URL}/security`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--accent) underline"
                  />
                ),
                ts: (
                  <a
                    href={`${REPO_URL}/blob/main/.github/workflows/codeql.yml`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--accent) underline"
                  />
                ),
                swift: (
                  <a
                    href={`${REPO_URL}/blob/main/.github/workflows/codeql-swift.yml`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--accent) underline"
                  />
                ),
              }}
            >
              {
                "<a>Security scans in CI</a>: grype over the bills and trivy over the images on every push; CodeQL for <ts>TypeScript</ts> and <swift>Swift</swift> in their own workflows; results in the <tab>Security tab</tab>."
              }
            </T>
          </li>
          <li>
            <T
              area="docsCommon"
              tags={{
                a: (
                  <a
                    href={`${REPO_URL}/blob/main/docs/ADRs/ADR-011-security-testing.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--accent) underline"
                  />
                ),
                b: (
                  <a
                    href={`${REPO_URL}/blob/main/docs/ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--accent) underline"
                  />
                ),
              }}
            >
              {
                "Decisions: <a>ADR-011</a> (the testing strategy) and <b>ADR-060</b> (the app lock; why certificate pinning and jailbreak detection were declined)."
              }
            </T>
          </li>
        </ul>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-semibold mb-3">
          <T area="docsCommon">{"Run it again"}</T>
        </h2>
        <div className="border border-(--border) rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {RUN_AGAIN.map(([cmd, what, file]) => (
                <tr
                  key={cmd}
                  className="border-b border-(--border) last:border-0"
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    <a
                      href={`${REPO_URL}/blob/main/${file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-(--accent) underline"
                    >
                      <code className="text-xs">{cmd}</code>
                    </a>
                  </td>
                  <td className="px-4 py-2 text-(--text-secondary)">
                    <T area="docsCommon">{what}</T>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
