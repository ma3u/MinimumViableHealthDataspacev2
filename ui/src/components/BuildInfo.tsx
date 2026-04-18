"use client";

import { ExternalLink } from "lucide-react";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const CHANNEL = process.env.NEXT_PUBLIC_BUILD_CHANNEL ?? "local";
const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ??
  "https://github.com/ma3u/MinimumViableHealthDataspacev2";

/**
 * Minimal version badge in the user menu — just `vX.Y.Z` linking to the
 * GitHub release. Commit SHA + build timestamp were removed per user
 * request: the release tag is enough to identify a prod build; developers
 * who need the SHA click through to the Release page.
 *
 * Local builds add a "+local" amber marker so we never mistake a dev
 * container for a released Azure demo.
 */
export function BuildInfo() {
  const isLocal = CHANNEL !== "release";
  const tag = `v${VERSION}`;
  const releaseHref = `${REPO_URL}/releases/tag/${tag}`;
  const releasesHref = `${REPO_URL}/releases`;

  return (
    <div
      className="px-3 py-2 border-t border-[var(--border)] text-[10px] leading-tight text-[var(--text-secondary)]"
      data-testid="user-menu-build-info"
    >
      <a
        href={isLocal ? releasesHref : releaseHref}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 font-mono hover:text-[var(--accent)] hover:underline"
        aria-label={
          isLocal
            ? `Open releases page (local build ${tag})`
            : `Open release ${tag}`
        }
        data-testid="user-menu-version-link"
      >
        <span>{tag}</span>
        {isLocal && (
          <span className="text-amber-600 dark:text-amber-400">+local</span>
        )}
        <ExternalLink size={9} aria-hidden="true" />
      </a>
    </div>
  );
}
