"use client";

/**
 * A link that leaves the hub, with its arrow icon. A client component so a
 * server page can hand it to <T> as a tag (ADR-071): <T> puts the translated
 * words in as children and the icon stays after them.
 */
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

export function ExternalA({
  href,
  children,
  className = "text-(--accent) underline inline-flex items-center gap-1",
  iconSize = 12,
}: {
  href: string;
  children?: ReactNode;
  className?: string;
  iconSize?: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children} <ExternalLink size={iconSize} aria-hidden="true" />
    </a>
  );
}
