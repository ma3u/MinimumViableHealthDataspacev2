/** @type {import('next').NextConfig} */
const { execSync } = require("child_process");
const pkg = require("./package.json");

const isStaticExport =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ||
  (!!process.env.GITHUB_ACTIONS &&
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "false");
const isDocker = !!process.env.DOCKER_BUILD;

function safeExec(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}
const buildSha =
  process.env.BUILD_SHA || safeExec("git rev-parse --short HEAD");
const buildTime = process.env.BUILD_TIME || new Date().toISOString();
const buildChannel = process.env.BUILD_CHANNEL || "local";

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_BUILD_CHANNEL: buildChannel,
    NEXT_PUBLIC_REPO_URL:
      process.env.NEXT_PUBLIC_REPO_URL ||
      "https://github.com/ma3u/MinimumViableHealthDataspacev2",
  },
  // Suppress X-Powered-By header (OWASP A05 — security misconfiguration)
  poweredByHeader: false,
  // Static export for GitHub Pages, standalone for Docker, default for dev
  ...(isStaticExport
    ? { output: "export" }
    : isDocker
      ? { output: "standalone" }
      : {}),
  ...(isStaticExport && {
    basePath: "/MinimumViableHealthDataspacev2",
  }),
  // Security headers (BSI C5 DEV-07 / OWASP A05) — skipped for static export
  // because GitHub Pages serves pre-built HTML without a Next.js server.
  //
  // Content-Security-Policy is *not* set here — it's emitted by middleware.ts
  // with a per-request nonce so script-src / style-src can drop 'unsafe-inline'.
  ...(!isStaticExport && {
    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Frame-Options", value: "DENY" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Permissions-Policy",
              value:
                "camera=(), microphone=(), geolocation=(), interest-cohort=()",
            },
            // HSTS — plugin 10035. 2-year max-age, preload-eligible.
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
            // Cross-Origin isolation — plugin 90004.
            // same-origin is the strictest value that still lets our own
            // static assets (Swagger UI, Mermaid) load.
            {
              key: "Cross-Origin-Resource-Policy",
              value: "same-origin",
            },
            {
              key: "Cross-Origin-Opener-Policy",
              value: "same-origin",
            },
            // credentialless is laxer than require-corp — it allows
            // cross-origin <img>/<script> without CORP headers, which
            // we need for Neo4j Browser + Keycloak iframes in dev.
            {
              key: "Cross-Origin-Embedder-Policy",
              value: "credentialless",
            },
          ],
        },
      ];
    },
  }),
  // Serve static HTML reports that live in public/ subdirectories
  // (rewrites are not supported with output: "export")
  ...(!isStaticExport && {
    async rewrites() {
      return [
        { source: "/e2e-report", destination: "/e2e-report/index.html" },
        { source: "/test-reports", destination: "/test-reports/index.html" },
      ];
    },
  }),
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
