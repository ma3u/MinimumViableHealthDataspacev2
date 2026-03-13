/** @type {import('next').NextConfig} */
const isStaticExport = !!process.env.GITHUB_ACTIONS;

const nextConfig = {
  // Only set output for CI static export; omit for local dev so Next.js
  // uses its default server mode and avoids stale-chunk 404 errors.
  ...(isStaticExport && { output: "export" }),
  ...(isStaticExport && {
    basePath: "/MinimumViableHealthDataspacev2",
  }),
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
