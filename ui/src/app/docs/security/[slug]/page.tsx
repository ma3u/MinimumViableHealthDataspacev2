import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { renderMarkdown } from "@/lib/docs/markdown";
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
  const html = renderMarkdown(doc.markdown);
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
      <article
        className="doc-prose"
        data-testid="security-doc"
        // The HTML comes from the repository's own Markdown, rendered at build time.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
