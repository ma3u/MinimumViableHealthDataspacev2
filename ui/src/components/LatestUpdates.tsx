import { Sparkles } from "lucide-react";

const REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";

interface Update {
  date: string;
  title: string;
  text: string;
  links: { label: string; href: string }[];
}

/** Newest first. Each entry names what changed for a visitor and links the
 *  pull request or decision behind it; keep it to the last few weeks. */
const LATEST_UPDATES: Update[] = [
  {
    date: "2026-11-01",
    title: "In German, French, Dutch and Spanish",
    text: "Pick a language in the menu bar: the menus, the sign-in page, this start page and the catalogue switch with it. Every dataset is described in German and Spanish, some in French and Dutch, and legal terms are the Regulation's own, checked against the Official Journal.",
    links: [
      { label: "#782", href: `${REPO}/issues/782` },
      {
        label: "ADR-070",
        href: `${REPO}/blob/main/docs/ADRs/ADR-070-the-interface-follows-the-language-picker-without-locale-urls.md`,
      },
      { label: "#786", href: `${REPO}/pull/786` },
      { label: "#787", href: `${REPO}/pull/787` },
    ],
  },
  {
    date: "2026-11-01",
    title: "National EHDS rules for six member states",
    text: "How Germany, Austria, Belgium, France, the Netherlands and Spain implement secondary use: the access body's legal role, the national law, the opt-out, fees and dates, each with its official source.",
    links: [{ label: "#783", href: `${REPO}/pull/783` }],
  },
  {
    date: "2026-10-31",
    title: "Confidential secure processing environments",
    text: "Two SPE workspaces as Azure confidential containers, which get their data key only after attesting to the access body's Trustee. The administration shows where each runs; bringing them up on Azure is under way.",
    links: [
      {
        label: "ADR-068",
        href: `${REPO}/blob/main/docs/ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md`,
      },
      { label: "#774", href: `${REPO}/issues/774` },
    ],
  },
  {
    date: "2026-10-31",
    title: "Safer natural language questions",
    text: "Cypher written by the language model runs in a read-only session, and k-anonymity applies to federated questions as it does to federated Cypher.",
    links: [
      { label: "#781", href: `${REPO}/pull/781` },
      { label: "#772", href: `${REPO}/pull/772` },
    ],
  },
  {
    date: "2026-10-29",
    title: "Klarbefund deletes everywhere",
    text: '"Delete all my data" in the iPhone app now deletes the account and its values on the hub too, and the app\'s menu shows trends, the record and duplicates.',
    links: [
      { label: "The app", href: "#klarbefund-title" },
      { label: "#769", href: `${REPO}/pull/769` },
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
    date: "2026-10-27",
    title: "HealthDCAT-AP Release 8, validated",
    text: "Every dataset description passes the official Release 8 SHACL the way the HealthData@EU validator checks it, and the Art. 71 opt-out filters every secondary-use query.",
    links: [
      { label: "#702", href: `${REPO}/pull/702` },
      { label: "#704", href: `${REPO}/pull/704` },
      { label: "#699", href: `${REPO}/pull/699` },
    ],
  },
  {
    date: "2026-10-16",
    title: "Security and operations, published",
    text: "The threat model, the security test report, the production readiness assessment and the load test results with their dashboards are under Docs.",
    links: [
      { label: "#659", href: `${REPO}/pull/659` },
      { label: "#672", href: `${REPO}/pull/672` },
      { label: "#671", href: `${REPO}/pull/671` },
    ],
  },
];

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function LatestUpdates() {
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
          Latest updates
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
                {u.title}
              </h3>
              <time
                dateTime={u.date}
                className="shrink-0 text-xs text-(--text-secondary)"
              >
                {formatDate(u.date)}
              </time>
            </div>
            <p className="text-sm text-(--text-secondary) leading-relaxed mb-2">
              {u.text}
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
                    {l.label}
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
