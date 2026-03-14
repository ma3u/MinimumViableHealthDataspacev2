/** @type {import('next').NextConfig} */
const isStaticExport = !!process.env.GITHUB_ACTIONS;
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
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
