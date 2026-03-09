/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.GITHUB_ACTIONS ? "export" : "standalone",
  ...(process.env.GITHUB_ACTIONS && {
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
