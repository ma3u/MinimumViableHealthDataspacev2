/** @type {import('next').NextConfig} */
const isStaticExport =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ||
  (!!process.env.GITHUB_ACTIONS &&
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "false");
const isDocker = !!process.env.DOCKER_BUILD;

const nextConfig = {
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
