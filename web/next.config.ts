import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Images load straight from each news source; no optimizer runs.
  images: {
    unoptimized: true,
  },
  // Static files only, served as the Cloudflare Worker's assets (docs/cloudflare-architecture.md).
  output: 'export',
};

export default nextConfig;
