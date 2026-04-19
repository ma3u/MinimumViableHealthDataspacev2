"use client";

import { ExternalLink } from "lucide-react";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const CHANNEL = process.env.NEXT_PUBLIC_BUILD_CHANNEL ?? "local";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ??
  "https://github.com/ma3u/MinimumViableHealthDataspacev2";

function shortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}`;
}

/**
 * Compact version badge shown to the right of Sign out: `vX.Y.Z · YYYY-MM-DD`
 * linking to the GitHub release page. Just the date (no time, no commit SHA)
 * — enough to correlate a reported issue to a release without clutter.
 *
 * Local builds add a "+local" amber marker so we never mistake a dev
 * container for a released Azure / GitHub Pages demo.
 */
export function BuildInfo() {
  const isLocal = CHANNEL !== "release";
  const tag = `v${VERSION}`;
  const date = shortDate(BUILD_TIME);
  const releaseHref = `${REPO_URL}/releases/tag/${tag}`;
  const releasesHref = `${REPO_URL}/releases`;

  return (
    <div data-testid="user-menu-build-info">
      <a
        href={isLocal ? releasesHref : releaseHref}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 font-mono text-[10px] leading-tight text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline"
        aria-label={
          isLocal
            ? `Open releases page (local build ${tag})`
            : `Open release ${tag}${date ? ` (${date})` : ""}`
        }
        data-testid="user-menu-version-link"
      >
        <span>{tag}</span>
        {isLocal && (
          <span className="text-amber-600 dark:text-amber-400">+local</span>
        )}
        {date && <span className="opacity-70">· {date}</span>}
        <ExternalLink size={9} aria-hidden="true" />
      </a>
    </div>
  );
}
