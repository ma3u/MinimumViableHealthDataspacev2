/**
 * DocFigure: a rendered diagram on a hand-written docs page.
 *
 * The SVGs are rendered from docs/<section>/diagrams/*.puml by
 * scripts/render-plantuml.sh and copied to public/published-docs by
 * scripts/gen-docs-content.py, so the hub serves them from itself (its CSP
 * allows images from 'self' only). The markup is the same as a figure in a
 * published Markdown document, so DocFigureViewer opens it full screen with
 * zoom when the page is wrapped in one; a click with a modifier key opens
 * the file itself.
 */
import type { ReactNode } from "react";

const BASE_PATH =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
    ? "/MinimumViableHealthDataspacev2"
    : "";

export function DocFigure({
  file,
  alt,
  caption,
}: {
  /** The file name under public/published-docs, e.g. "deployment.svg". */
  file: string;
  alt: string;
  caption: ReactNode;
}) {
  const src = `${BASE_PATH}/published-docs/${file}`;
  return (
    <figure className="my-6 doc-prose">
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="doc-figure"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" />
      </a>
      <figcaption className="text-center text-sm text-(--text-secondary) mt-2 italic">
        {caption}
      </figcaption>
    </figure>
  );
}
