import { STATIC_SITE_URL } from "@/lib/offline-mode";
import { publishedDocs, REPO_URL } from "@/lib/docs/published-docs";

export const dynamic = "force-static";

/**
 * /llms.txt (llmstxt.org): what the site is and where its documentation is,
 * for AI assistants that read a site before they answer about it. The list of
 * documents comes from the same index the /docs pages render, so it cannot
 * drift from them. Links go to the static site, the indexed copy.
 */
const SECTIONS: Record<string, string> = {
  ehds: "The EHDS Regulation",
  developer: "Developer documentation",
  operations: "Operations",
  security: "Security and data protection",
  klarbefund: "Klarbefund, the iPhone app",
};

const PAGES: [string, string, string][] = [
  ["Interactive demo", "/", "seven roles, 127 synthetic patients, no sign-in"],
  ["User guide", "/docs/user-guide", "every page of the demo, role by role"],
  [
    "Architecture",
    "/docs/architecture",
    "the five-layer knowledge graph and the services",
  ],
  [
    "EHDS glossary",
    "/docs/ehds/glossary",
    "the Regulation's terms as the code uses them",
  ],
  ["Roadmap", "/docs/roadmap", "what is built and what comes next, to 2031"],
  [
    "API reference",
    "/docs/developer/api",
    "the OpenAPI description of the hub",
  ],
];

export function GET() {
  const lines = [
    "# European Health Data Space: interactive demo and reference implementation",
    "",
    "> An open-source reference implementation of the European Health Data Space (Regulation (EU) 2025/327). It joins the Dataspace Protocol (Eclipse EDC), FHIR R4, OMOP CDM, HealthDCAT-AP and biomedical ontologies in one Neo4j knowledge graph, with 127 synthetic patients and fictional organisations only. No real health data is processed.",
    "",
    `Source code: ${REPO_URL} (Apache 2.0). The demo runs without sign-in at ${STATIC_SITE_URL}/; a live stack with sign-in runs in office hours at https://ehds.mabu.red.`,
    "",
    "## Start here",
    "",
    ...PAGES.map(
      ([t, p, d]) => `- [${t}](${STATIC_SITE_URL}${p === "/" ? "/" : p}): ${d}`,
    ),
    "",
  ];
  for (const [section, heading] of Object.entries(SECTIONS)) {
    const docs = publishedDocs.filter((d) => d.section === section);
    if (docs.length === 0) continue;
    lines.push(`## ${heading}`, "");
    for (const d of docs) {
      lines.push(
        `- [${d.title}](${STATIC_SITE_URL}/docs/${d.section}/${d.slug}): ${d.summary}`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## Optional",
    "",
    `- [Legal notice](${STATIC_SITE_URL}/impressum)`,
    `- [Privacy policy](${STATIC_SITE_URL}/datenschutz)`,
    "",
  );
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
