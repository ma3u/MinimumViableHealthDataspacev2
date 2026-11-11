/**
 * The OpenAPI document with the hub the reader is on as its first server.
 *
 * ui/public/openapi.yaml lists the Azure demo first, and Swagger UI sends
 * "Try it out" to the first server. A reader on a local stack, signed in
 * there, therefore called https://ehds.mabu.red from the Swagger page: another
 * origin, which gets no session cookie and answers 401 or is blocked by the
 * browser (found on 2026-11-11 by trying it). Scalar has `baseServerURL` for
 * this; Swagger UI has no such option, so the page rewrites the `servers`
 * block of the YAML text before Swagger UI reads it.
 *
 * Works on the text, not on a parsed document: the UI has no YAML parser of
 * its own, and the block has one shape, a list of `- url:` entries.
 */
export function specForThisHub(spec: string, origin: string): string {
  const block = /^servers:\n((?:[ \t]+.*\n|\n)*)/m.exec(spec);
  if (!block) return spec;

  // Entries start at "  - url:"; comment lines above one belong to the block
  // as a whole and are dropped, since the note they carry is about the order.
  const entries = block[1]
    .split(/^(?=[ \t]*- url:)/m)
    .filter((e) => /^[ \t]*- url:/.test(e))
    .map((e) => e.replace(/\n+$/, "\n"));
  const others = entries.filter(
    (e) => /- url:\s*(\S+)/.exec(e)?.[1].replace(/^["']|["']$/g, "") !== origin,
  );
  const here = `  - url: ${origin}\n    description: This hub, where you are signed in\n`;
  return (
    spec.slice(0, block.index) +
    "servers:\n" +
    here +
    others.join("") +
    "\n" +
    spec.slice(block.index + block[0].length)
  );
}
