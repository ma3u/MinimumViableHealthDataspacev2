/**
 * The graph explorer's labels in the language picked in the menu (#782,
 * ADR-070). The labels live in English in lib/graph-constants.ts, which the
 * graph API reads too, so they are translated where they are shown and not
 * where they are defined.
 *
 * Several of them join a name and its explanation with an em dash, which the
 * dictionaries do not hold (house style). The key reads a colon in its place,
 * or a comma where the sentence simply goes on ("..., with their contracts"),
 * and so does the English the page shows.
 */
const EM_DASH = String.fromCharCode(0x2014);

/** A label from graph-constants as its dictionary key. */
export function graphKey(text: string): string {
  const [first, ...rest] = text.split(EM_DASH).map((p) => p.trim());
  let out = first;
  for (const next of rest) {
    const goesOn = out.includes(",") || /^(with|and|ready)\b/.test(next);
    out += (goesOn ? ", " : ": ") + next;
  }
  return out;
}
