/**
 * Screenshots and diagrams in the picked language (ADR-071).
 *
 * ui/src/content/localized-images.json, written by
 * scripts/gen-localized-images.py, maps an English image's public path to
 * its translated variants:
 *
 *   /images/guide/<file>         -> /images/guide/<lang>/<file>
 *   /images/screenshots/<file>   -> /images/screenshots/<lang>/<file>
 *   /published-docs/<stem>.<ext> -> /published-docs/<stem>.<lang>.<ext>
 *
 * A language with no variant shows the English image.
 */
import manifest from "@/content/localized-images.json";
import type { CatalogLanguage } from "@/lib/metadata-language";

type Manifest = Record<string, Partial<Record<CatalogLanguage, string>>>;

const IMAGES = manifest.images as Manifest;

/** The public path of an image in a language: its translated variant when
 *  the manifest lists one, else the English path it was given. Paths are
 *  without the static export's base path. */
export function localizedImagePath(
  path: string,
  lang: CatalogLanguage,
): string {
  if (lang === "en") return path;
  return IMAGES[path]?.[lang] ?? path;
}
