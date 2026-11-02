/**
 * The language the screenshot captures take their pictures in (ADR-071).
 * SCREENSHOT_LANG=de (or fr, nl, es) opens each page with ?lang=<lang>,
 * which the language picker reads first, and the captures save into a
 * <lang>/ subfolder next to the English images. Unset (or en) is English
 * into the folder itself.
 */
const LANGS = ["de", "fr", "nl", "es"] as const;
type ScreenshotLang = (typeof LANGS)[number];

/** The language asked for, or undefined for English. An unknown value is
 *  an error rather than English pictures saved under a wrong name. */
export function screenshotLang(): ScreenshotLang | undefined {
  const v = process.env.SCREENSHOT_LANG?.trim().toLowerCase();
  if (!v || v === "en") return undefined;
  if (!(LANGS as readonly string[]).includes(v)) {
    throw new Error(
      `SCREENSHOT_LANG=${v}: use one of ${LANGS.join(
        ", ",
      )}, or leave it unset for English`,
    );
  }
  return v as ScreenshotLang;
}

/** The path with ?lang=<lang> added, keeping any query it has. */
export function withLang(url: string, lang: string | undefined): string {
  if (!lang) return url;
  const [path, hash] = url.split("#", 2);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}lang=${lang}${hash !== undefined ? `#${hash}` : ""}`;
}
