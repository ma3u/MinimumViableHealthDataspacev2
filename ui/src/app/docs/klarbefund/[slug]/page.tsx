import { notFound } from "next/navigation";
import { PublishedDocPage } from "@/components/docs/PublishedDoc";
import { docsInSection, findDoc } from "@/lib/docs/published-docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return docsInSection("klarbefund").map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const doc = findDoc("klarbefund", (await params).slug);
  return doc ? { title: doc.title, description: doc.summary } : {};
}

export default async function KlarbefundDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const doc = findDoc("klarbefund", (await params).slug);
  if (!doc) notFound();
  return (
    <PublishedDocPage
      doc={doc}
      backHref="/docs/klarbefund"
      backLabel="Klarbefund"
      lastUpdatedPage="/docs/klarbefund/[slug]"
    />
  );
}
