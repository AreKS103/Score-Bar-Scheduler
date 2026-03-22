import type { NextConfig } from 'next';
import path from 'path';

// On local Windows/OneDrive dev: put build output in AppData to avoid EBUSY/EPERM
// file-lock errors caused by OneDrive syncing .next files while Next.js writes them.
// On Vercel/CI: LOCALAPPDATA is not set, so fall back to the default '.next'.
// NOTE: Next.js resolves distDir relative to the project root, so we must provide
// a relative path — but it CAN safely start with '..' to escape the project folder.
// IMPORTANT: Only apply custom distDir during `next dev` (phase-development-server).
// Production builds must use default '.next' — compiled files can't resolve next/*
// modules when the output directory is outside the project tree on Windows.
function resolveDistDir(): string | undefined {
  if (process.env.VERCEL || process.env.CI || !process.env.LOCALAPPDATA) {
    return undefined; // use default '.next'
  }
  // Only use AppData distDir during dev server, not builds
  if (process.env.NEXT_PHASE !== 'phase-development-server') {
    return undefined;
  }
  const target = path.join(process.env.LOCALAPPDATA, 'scorebarschedule-next');
  return path.relative(process.cwd(), target);
}

const distDir = resolveDistDir();

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  async headers() {
    return [
      {
        // Security headers for all routes except embeds
        source: '/((?!embed).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        // Embed pages: allow framing (needed for WordPress iframes) but add other headers
        source: '/embed/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
