"use client";

/**
 * A translated text whose parts in <tag>...</tag> link to links[tag]: a docs
 * page by its route, anything else in a new tab. The links cross from the
 * server page as strings and become elements here, so a text with many
 * sources does not hand <T> elements through the server-client boundary,
 * which the dev server rendered as an element of undefined type (the
 * roadmap's first driver, 2026-11-07).
 */
import Link from "next/link";
import { T } from "@/lib/i18n/translate";
import type { Area } from "@/messages";

const LINK_CLASS = "text-(--accent) underline";

export function LinkedText({
  area,
  text,
  links,
}: {
  area: Area;
  text: string;
  links?: Readonly<Record<string, string>>;
}) {
  const tags = links
    ? Object.fromEntries(
        Object.entries(links).map(([tag, href]) => [
          tag,
          href.startsWith("/") ? (
            <Link href={href} className={LINK_CLASS} />
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            />
          ),
        ]),
      )
    : undefined;
  return (
    <T area={area} tags={tags}>
      {text}
    </T>
  );
}
