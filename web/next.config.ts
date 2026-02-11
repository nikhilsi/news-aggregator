import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow images from any news source domain
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
