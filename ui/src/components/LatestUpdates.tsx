"use client";

import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/translate";
import type { CatalogLanguage } from "@/lib/metadata-language";
import { BASE_PATH } from "@/lib/static-export";
import { useLanguage } from "@/lib/use-language";

const REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";

interface Update {
  date: string;
  title: string;
  text: string;
  links: { label: string; href: string }[];
}

const pr = (n: number) => ({ label: `#${n}`, href: `${REPO}/pull/${n}` });

/** Newest first. Each entry names what changed for a visitor and links the
 *  pull requests or decisions behind it; similar changes share one entry,
 *  and the list covers the last three months. The
 *  title, the text and a link label that is not a number are English keys of
 *  the home dictionary, translated at display (#782); a unit test checks
 *  that every language has them. */
export const LATEST_UPDATES: Update[] = [
  {
    date: "2026-11-06",
    title: "EDC 1.0, tested before it goes live",
    text: "On the local stack the connector, the identity hub and the issuer run on Eclipse Dataspace Components 1.0 (release candidate 5), with siglet as the data plane, and the hub provisions a new participant itself. The identity, dataspace and health checks pass there as they do on 0.18. The live hub, on EDC 0.18 since October with onboarding on Azure, moves once the final 1.0 is released.",
    links: [
      { label: "#881", href: `${REPO}/issues/881` },
      {
        label: "ADR-055",
        href: `${REPO}/blob/main/docs/ADRs/ADR-055-azure-runs-the-compose-jad-build.md`,
      },
      ...[593, 615, 878].map(pr),
    ],
  },
  {
    date: "2026-11-06",
    title: "Open Solution Award at the HL7 AI Challenge",
    text: "HL7 has published the recording of its 2026 AI Challenge winners webinar of 14 October. Our part starts at 39:45 and shows why the platform's AI would rather say nothing than say it wrong; the slides are here too.",
    links: [
      {
        label: "Video from 39:45",
        href: "https://vimeo.com/1237616254/7fd639a118#t=39m45s",
      },
      {
        label: "Slides",
        href: `${BASE_PATH}/presentations/hl7-showcase-2026/`,
      },
      { label: "#66", href: `${REPO}/issues/66` },
    ],
  },
  {
    date: "2026-11-05",
    title: "My data: contracts, transfers and the SPE in one place",
    text: "A health data user sees their contracts and data in one list, each transfer with its dates, method and policy, imports a transfer into a secure processing environment and views it in 3D. The terms they agree to come from a minimal set of standard policies.",
    links: [
      {
        label: "ADR-077",
        href: `${REPO}/blob/main/docs/ADRs/ADR-077-a-minimal-set-of-standard-data-sharing-policies.md`,
      },
      ...[883, 885, 893, 896, 897, 898, 901].map(pr),
    ],
  },
  {
    date: "2026-11-03",
    title: "Confidential secure processing environments",
    text: "Two SPE workspaces run as Azure confidential containers and get their data key from the access body's Trustee only after AMD SEV-SNP hardware attestation. They start on demand, stop themselves when idle, and the administration shows where each runs.",
    links: [
      { label: "#774", href: `${REPO}/issues/774` },
      {
        label: "ADR-068",
        href: `${REPO}/blob/main/docs/ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md`,
      },
      {
        label: "ADR-072",
        href: `${REPO}/blob/main/docs/ADRs/ADR-072-spe-workspaces-start-on-demand.md`,
      },
      ...[775, 801, 835, 836].map(pr),
    ],
  },
  {
    date: "2026-11-02",
    title: "The hub and its documentation in five languages",
    text: "Pick English, German, French, Dutch or Spanish in the menu bar: every page, the published documents, their screenshots and diagrams follow, legal terms are the Regulation's own, and every dataset is described in German and Spanish.",
    links: [
      { label: "#782", href: `${REPO}/issues/782` },
      {
        label: "ADR-070",
        href: `${REPO}/blob/main/docs/ADRs/ADR-070-the-interface-follows-the-language-picker-without-locale-urls.md`,
      },
      {
        label: "ADR-071",
        href: `${REPO}/blob/main/docs/ADRs/ADR-071-the-documentation-follows-the-language-picker.md`,
      },
      ...[787, 807, 818, 826].map(pr),
    ],
  },
  {
    date: "2026-11-02",
    title: "Trust in every access",
    text: "Every ODRL policy is explained in plain language and checked against ODRL 2.2 and the EHDS rules, the access log rates each access by criticality, every API route needs a sign-in, and questions in natural language run read-only, leave a hash-chained FHIR AuditEvent and respect k-anonymity.",
    links: [
      {
        label: "ADR-044",
        href: `${REPO}/blob/main/docs/ADRs/ADR-044-every-api-route-needs-a-session.md`,
      },
      ...[819, 817, 498, 781, 772].map(pr),
    ],
  },
  {
    date: "2026-11-01",
    title: "HealthDCAT-AP Release 8, validated",
    text: "Every dataset description passes the official Release 8 SHACL the way the HealthData@EU validator checks it, the Art. 71 opt-out filters every secondary-use query, and the national EHDS rules of Germany, Austria, Belgium, France, the Netherlands and Spain are documented with their official sources.",
    links: [
      {
        label: "ADR-063",
        href: `${REPO}/blob/main/docs/ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md`,
      },
      {
        label: "ADR-062",
        href: `${REPO}/blob/main/docs/ADRs/ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md`,
      },
      ...[699, 702, 704, 783].map(pr),
    ],
  },
  {
    date: "2026-10-29",
    title: "Klarbefund, the iPhone app",
    text: 'The app reads paper lab reports into trends, creates its own sandbox account gated by App Attest and sends the reports into the person\'s own EHDS record. "Delete all my data" deletes on the hub too, and the beta is open by a public TestFlight link.',
    links: [
      { label: "The app", href: "#klarbefund-title" },
      {
        label: "ADR-054",
        href: `${REPO}/blob/main/docs/ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md`,
      },
      ...[476, 555, 769].map(pr),
    ],
  },
  {
    date: "2026-10-28",
    title: "Sign in with an EUDI wallet",
    text: "The hub runs its own verifier for d-you, the German EUDI wallet. A PID signs in to, links to or creates a sandbox account by a secure hash, never by the person's name.",
    links: [
      {
        label: "ADR-067",
        href: `${REPO}/blob/main/docs/ADRs/ADR-067-a-pid-links-to-an-account-by-a-keyed-fingerprint.md`,
      },
      { label: "#756", href: `${REPO}/pull/756` },
      { label: "#764", href: `${REPO}/pull/764` },
    ],
  },
  {
    date: "2026-10-28",
    title: "Trusted issuers and protocol checks that can fail",
    text: "Each issuer is trusted only for its own credential types, with a Simpl Governance Authority for membership, and a credential from a rogue issuer is refused. The DSP and DCP suites fail the build below their floors, and a daily check negotiates against the live hub.",
    links: [
      {
        label: "ADR-031",
        href: `${REPO}/blob/main/docs/ADRs/ADR-031-checks-must-assert.md`,
      },
      ...[344, 739, 744, 878].map(pr),
    ],
  },
  {
    date: "2026-10-16",
    title: "Security and operations, published",
    text: "The threat model, the security test report, the production readiness assessment and the load test results with their Grafana dashboards are under Docs. The audit trail and the connectors report to Grafana, and the hub stops off hours and starts again by itself.",
    links: [
      {
        label: "ADR-053",
        href: `${REPO}/blob/main/docs/ADRs/ADR-053-everything-stops-off-hours.md`,
      },
      {
        label: "ADR-058",
        href: `${REPO}/blob/main/docs/ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md`,
      },
      ...[659, 671, 672, 510, 546].map(pr),
    ],
  },
  {
    date: "2026-09-25",
    title: "The access body decides, and the permit gates the data",
    text: "The health data access body decides on applications, publishes the register of data permits, revokes a permit, answers health data requests in anonymised statistical form (Art. 69) and generates its activity report (Art. 59). Without a permit there is no transfer and no secure processing environment.",
    links: [
      { label: "#206", href: `${REPO}/issues/206` },
      ...[207, 208, 210, 211, 212, 298].map(pr),
    ],
  },
  {
    date: "2026-09-24",
    title: "An overview for every persona",
    text: "Every sign-in lands on a 3D overview for the patient, the access body, the holder or the researcher, with time series, trends and the data behind each view, and the start page opens on a living body.",
    links: [
      { label: "#271", href: `${REPO}/issues/271` },
      ...[274, 277, 279, 281, 461].map(pr),
    ],
  },
];

const LOCALE: Record<CatalogLanguage, string> = {
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  nl: "nl-NL",
  es: "es-ES",
};

/** A link label to translate: not a pull request, issue or ADR number. */
export const isWordLabel = (label: string) => !/^(#\d+|ADR-\d+)$/.test(label);

function formatDate(iso: string, lang: CatalogLanguage): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function LatestUpdates() {
  const t = useT("home");
  const lang = useLanguage();
  return (
    <section
      className="mt-12 sm:mt-16 animate-fade-in-up"
      style={{ animationDelay: "1900ms" }}
      aria-labelledby="updates-title"
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles
          size={18}
          className="text-amber-700 dark:text-amber-300"
          aria-hidden="true"
        />
        <h2 id="updates-title" className="text-lg sm:text-xl font-bold">
          {t("Latest updates")}
        </h2>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {LATEST_UPDATES.map((u) => (
          <li
            key={u.title}
            className="rounded-xl border border-(--border) bg-(--surface)/60 p-4"
          >
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h3 className="text-sm font-semibold text-(--text-primary)">
                {t(u.title)}
              </h3>
              <time
                dateTime={u.date}
                className="shrink-0 text-xs text-(--text-secondary)"
              >
                {formatDate(u.date, lang)}
              </time>
            </div>
            <p className="text-sm text-(--text-secondary) leading-relaxed mb-2">
              {t(u.text)}
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {u.links.map((l) => {
                const external = l.href.startsWith("http");
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="text-(--accent) underline underline-offset-2 hover:text-(--text-primary) transition-colors"
                  >
                    {isWordLabel(l.label) ? t(l.label) : l.label}
                  </a>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
