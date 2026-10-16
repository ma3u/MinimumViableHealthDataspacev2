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

/** A heading that already carries its number in the source, "## 7. Incidents"
 *  or "### 7.2 Clocks": the document numbers itself, so the renderer does not. */
const NUMBERED = /^\d+(\.\d+)*\.?\s/;

/** Section numbers for the document being rendered: h2 counts "1.", h3
 *  "1.1"; off for a document whose own headings are numbered, and off for
 *  renderMarkdown on its own. splitMermaid switches it on for one document
 *  and renders it in order. */
const numbering = { on: false, h2: 0, h3: 0 };

function sectionNumber(depth: number, text: string): string {
  if (!numbering.on || NUMBERED.test(text)) return "";
  if (depth === 2) {
    numbering.h2 += 1;
    numbering.h3 = 0;
    return `${numbering.h2}.`;
  }
  if (depth === 3 && numbering.h2 > 0) {
    numbering.h3 += 1;
    return `${numbering.h2}.${numbering.h3}`;
  }
  return "";
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }: Tokens.Heading) {
      const html = this.parser.parseInline(tokens);
      const text = tokens.map((t) => ("text" in t ? t.text : t.raw)).join("");
      // The anchor stays GitHub's, from the text without the number, so a
      // link written against the file on GitHub still lands here.
      const id = headingId(text);
      const n = sectionNumber(depth, text);
      const label = n ? `<span class="doc-num">${n}</span> ` : "";
      return `<h${depth} id="${id}">${label}${html}</h${depth}>\n`;
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
  // A document that numbers its own h2 headings keeps its numbers.
  numbering.on = !/^##\s+\d+(\.\d+)*\.?\s/m.test(markdown);
  numbering.h2 = 0;
  numbering.h3 = 0;
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
  numbering.on = false;
  return out;
}
