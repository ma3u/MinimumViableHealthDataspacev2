"use client";

/**
 * An image of the documentation in the language picked in the menu
 * (ADR-071): the translated screenshot or diagram when
 * ui/src/content/localized-images.json lists one for that language, the
 * English one otherwise. `src` is the English public path without the
 * static export's base path, e.g. "/images/guide/catalog.webp"; the base
 * path is added here. English on the server and the first render, like
 * every translated text.
 */
import type { ImgHTMLAttributes } from "react";
import { localizedImagePath } from "@/lib/i18n/localized-images";
import { BASE_PATH } from "@/lib/static-export";
import { useLanguage } from "@/lib/use-language";

/** The URL to load an image from in the picked language, base path
 *  included; for a link to the image as well as the image itself. */
export function useLocalizedImageSrc(path: string): string {
  const lang = useLanguage();
  return `${BASE_PATH}${localizedImagePath(path, lang)}`;
}

export function LocalizedImage({
  src,
  alt,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string;
  alt: string;
}) {
  const url = useLocalizedImageSrc(src);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} {...rest} />;
}
