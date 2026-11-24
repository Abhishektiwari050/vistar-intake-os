import type { NextConfig } from 'next';
import * as path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['sharp', '@electric-sql/pglite'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
