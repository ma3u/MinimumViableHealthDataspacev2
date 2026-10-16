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
