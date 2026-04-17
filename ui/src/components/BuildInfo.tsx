"use client";

import { ExternalLink } from "lucide-react";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";
const TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const CHANNEL = process.env.NEXT_PUBLIC_BUILD_CHANNEL ?? "local";
const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ??
  "https://github.com/ma3u/MinimumViableHealthDataspacev2";

function formatBuildTime(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate(),
    )} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

export function BuildInfo() {
  const isLocal = CHANNEL !== "release";
  const tag = `v${VERSION}`;
  const releaseHref = `${REPO_URL}/releases/tag/${tag}`;
  const commitHref = SHA ? `${REPO_URL}/commit/${SHA}` : REPO_URL;
  const releasesHref = `${REPO_URL}/releases`;

  return (
    <div
      className="px-3 py-2 border-t border-[var(--border)] text-[10px] leading-tight text-[var(--text-secondary)]"
      data-testid="user-menu-build-info"
    >
      <div className="flex items-center justify-between gap-2">
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
        {SHA && (
          <a
            href={commitHref}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono hover:text-[var(--accent)] hover:underline"
            aria-label={`View commit ${SHA}`}
          >
            {SHA}
          </a>
        )}
      </div>
      {TIME && (
        <div className="mt-0.5 opacity-70">
          {isLocal ? "Built locally" : "Released"} · {formatBuildTime(TIME)}
        </div>
      )}
    </div>
  );
}
