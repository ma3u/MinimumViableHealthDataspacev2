import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import MermaidDiagram from "@/components/MermaidDiagram";
import { splitMermaid } from "@/lib/docs/markdown";
import {
  findSecurityDoc,
  REPO_URL,
  securityDocs,
} from "@/lib/docs/security-docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return securityDocs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const doc = findSecurityDoc((await params).slug);
  return doc ? { title: doc.title, description: doc.summary } : {};
}

export default async function SecurityDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const doc = findSecurityDoc((await params).slug);
  if (!doc) notFound();
  // Images the reports embed are copied to public/published-docs by
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
        href="/docs/security"
        className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
      >
        <ArrowLeft size={14} /> Security and Data Protection
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-6">
        <DocsLastUpdated page="/docs/security/[slug]" />
        <a
          href={`${REPO_URL}/blob/main/${doc.source}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-(--accent) underline mb-4"
        >
          <code>{doc.source}</code> on GitHub <ExternalLink size={11} />
        </a>
      </div>
      <article className="doc-prose" data-testid="security-doc">
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
      </article>
    </div>
  );
}
