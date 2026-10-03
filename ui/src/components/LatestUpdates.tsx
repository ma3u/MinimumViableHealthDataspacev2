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
    date: "2026-10-03",
    title: "A living body on the start page",
    text: "The hero now shows the body as a network of organs, walking in place, beside the introduction.",
    links: [{ label: "#461", href: `${REPO}/pull/461` }],
  },
  {
    date: "2026-10-03",
    title: "Static analysis on every change",
    text: "Semgrep runs before every commit with a rule against Cypher built from request input, CodeQL checks every pull request, and all 20 images running on Azure are scanned for CVEs every week.",
    links: [
      { label: "#446", href: `${REPO}/pull/446` },
      { label: "#448", href: `${REPO}/pull/448` },
      { label: "#451", href: `${REPO}/pull/451` },
    ],
  },
  {
    date: "2026-10-02",
    title: "Every API route needs a sign-in",
    text: "Only the sign-in flows and the health probe answer anonymously. The registers and the graph moved behind a session, and the API collection checks each 401.",
    links: [
      {
        label: "ADR-044",
        href: `${REPO}/blob/main/docs/ADRs/ADR-044-every-api-route-needs-a-session.md`,
      },
      { label: "#414", href: `${REPO}/pull/414` },
    ],
  },
  {
    date: "2026-09-27",
    title: "The API collection, by EHDS persona",
    text: "132 Bruno requests, one folder per role in the regulation, run against this demo on every change to the UI.",
    links: [
      { label: "#350", href: `${REPO}/pull/350` },
      { label: "#355", href: `${REPO}/pull/355` },
    ],
  },
  {
    date: "2026-09-24",
    title: "An overview for every persona",
    text: "Every sign-in lands on a 3D overview made for its role: the patient, the access body, the data holder and the researcher.",
    links: [{ label: "#271", href: `${REPO}/issues/271` }],
  },
  {
    date: "2026-09-22",
    title: "Klarbefund, the iPhone app",
    text: "Published reference ranges for 57 more analytes, microbiome organisms named by their NCBI Taxonomy id, and a full export or deletion of everything the app holds.",
    links: [
      { label: "The app", href: "#klarbefund-title" },
      { label: "#186", href: `${REPO}/issues/186` },
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
      className="mb-12 sm:mb-16 animate-fade-in-up"
      style={{ animationDelay: "125ms" }}
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
