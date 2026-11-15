import type { NextConfig } from 'next';
const config: NextConfig = { distDir: process.env.LIVESHOT_DIST_DIR || '.next', serverExternalPackages: ['@daytona/sdk', 'playwright'] };
export default config;
