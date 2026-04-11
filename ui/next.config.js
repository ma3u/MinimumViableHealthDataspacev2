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
  ...(!isStaticExport && {
    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            {
              key: "X-Frame-Options",
              value: "DENY",
            },
            {
              key: "X-Content-Type-Options",
              value: "nosniff",
            },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Permissions-Policy",
              value: "camera=(), microphone=(), geolocation=()",
            },
            {
              key: "Content-Security-Policy",
              value: [
                "default-src 'self'",
                // Next.js inline scripts (nonce-less dev mode)
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob:",
                // Neo4j Browser, Keycloak (local dev only)
                "connect-src 'self' http://localhost:7474 http://localhost:8080 ws://localhost:*",
                "font-src 'self'",
                "frame-src 'none'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
              ].join("; "),
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
