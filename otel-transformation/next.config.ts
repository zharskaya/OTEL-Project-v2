import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isProd ? '/OTEL-Project-v2' : '',
  assetPrefix: isProd ? '/OTEL-Project-v2/' : undefined,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // Empty turbopack config to satisfy Next.js 16+ requirements
  turbopack: {},
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
