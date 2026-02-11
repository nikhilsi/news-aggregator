import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow images from any news source domain
  images: {
    unoptimized: true,
  },
  // Produce a self-contained build for Docker (copies only needed files)
  output: 'standalone',
};

export default nextConfig;
