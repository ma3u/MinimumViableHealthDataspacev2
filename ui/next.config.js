/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.GITHUB_ACTIONS ? "export" : "standalone",
  basePath: process.env.GITHUB_ACTIONS ? "/MinimumViableHealthDataspacev2" : "",
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
