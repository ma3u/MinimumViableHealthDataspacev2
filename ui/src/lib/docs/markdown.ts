import { Marked, type Tokens } from "marked";

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens,
 *  so a link written against the file on GitHub lands on the same heading here. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }: Tokens.Heading) {
      const html = this.parser.parseInline(tokens);
      const id = headingId(
        tokens.map((t) => ("text" in t ? t.text : t.raw)).join(""),
      );
      return `<h${depth} id="${id}">${html}</h${depth}>\n`;
    },
    image({ href, title, text }: Tokens.Image) {
      // A diagram is scaled to the column; the link opens it at full size.
      const alt = text.replace(/"/g, "&quot;");
      const t = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="doc-figure"><img src="${href}" alt="${alt}"${t} loading="lazy" /></a>`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href);
      const attrs = [
        `href="${href}"`,
        title ? `title="${title}"` : "",
        external ? 'target="_blank" rel="noopener noreferrer"' : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<a ${attrs}>${text}</a>`;
    },
  },
});

/** Markdown (GitHub flavour) to HTML, for the reports the hub publishes. The
 *  input is the repository's own documentation, never a visitor's. */
export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown) as string;
}

export type DocSegment =
  | { kind: "html"; html: string }
  | { kind: "mermaid"; chart: string };

/** Split a document at its ```mermaid fences: the text between them is
 *  rendered to HTML, each fence becomes a diagram the page draws with
 *  MermaidDiagram (marked would only show the source as code). */
export function splitMermaid(markdown: string): DocSegment[] {
  const out: DocSegment[] = [];
  const fence = /^```mermaid[ \t]*\n([\s\S]*?)^```[ \t]*$/gm;
  let last = 0;
  for (const m of markdown.matchAll(fence)) {
    const before = markdown.slice(last, m.index);
    if (before.trim()) out.push({ kind: "html", html: renderMarkdown(before) });
    out.push({ kind: "mermaid", chart: m[1].trim() });
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = markdown.slice(last);
  if (rest.trim()) out.push({ kind: "html", html: renderMarkdown(rest) });
  return out;
}
