import { notFound } from "next/navigation";
import { PublishedDocPage } from "@/components/docs/PublishedDoc";
import { findSecurityDoc, securityDocs } from "@/lib/docs/security-docs";

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
  return (
    <PublishedDocPage
      doc={doc}
      backHref="/docs/security"
      backLabel="Security and Data Protection"
      lastUpdatedPage="/docs/security/[slug]"
    />
  );
}
