/** @type {import('next').NextConfig} */
const isStaticExport =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ||
  (!!process.env.GITHUB_ACTIONS &&
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "false");
const isDocker = !!process.env.DOCKER_BUILD;

const nextConfig = {
  // Static export for GitHub Pages, standalone for Docker, default for dev
  ...(isStaticExport
    ? { output: "export" }
    : isDocker
      ? { output: "standalone" }
      : {}),
  ...(isStaticExport && {
    basePath: "/MinimumViableHealthDataspacev2",
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
