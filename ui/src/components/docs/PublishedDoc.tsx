import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocFigureViewer } from "@/components/docs/DocFigureViewer";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import MermaidDiagram from "@/components/MermaidDiagram";
import { splitMermaid } from "@/lib/docs/markdown";
import { REPO_URL, type PublishedDoc } from "@/lib/docs/published-docs";

/** One document published from docs/, rendered from its Markdown at build
 *  time, with the link back to its section and to its source on GitHub. */
export function PublishedDocPage({
  doc,
  backHref,
  backLabel,
  lastUpdatedPage,
}: {
  doc: PublishedDoc;
  backHref: string;
  backLabel: string;
  lastUpdatedPage: string;
}) {
  // Images the documents embed are copied to public/published-docs by
  // scripts/gen-docs-content.py and referenced through a placeholder, so the
  // GitHub Pages build (basePath) and the hub (none) both find them.
  const basePath =
    process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
      ? "/MinimumViableHealthDataspacev2"
      : "";
  const segments = splitMermaid(doc.markdown).map((seg) =>
    seg.kind === "html"
      ? { ...seg, html: seg.html.replaceAll("__BASE_PATH__/", `${basePath}/`) }
      : seg,
  );
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
      >
        <ArrowLeft size={14} /> {backLabel}
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-6">
        <DocsLastUpdated page={lastUpdatedPage} />
        <a
          href={`${REPO_URL}/blob/main/${doc.source}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-(--accent) underline mb-4"
        >
          <code>{doc.source}</code> on GitHub <ExternalLink size={11} />
        </a>
      </div>
      {/* A click on a diagram or screenshot opens it full screen with zoom. */}
      <article className="doc-prose" data-testid="published-doc">
        <DocFigureViewer>
          {segments.map((seg, i) =>
            seg.kind === "mermaid" ? (
              <MermaidDiagram key={i} chart={seg.chart} />
            ) : (
              <div
                key={i}
                // The HTML comes from the repository's own Markdown, rendered at build time.
                dangerouslySetInnerHTML={{ __html: seg.html }}
              />
            ),
          )}
        </DocFigureViewer>
      </article>
    </div>
  );
}
