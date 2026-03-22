import type { NextConfig } from 'next';
import path from 'path';

// On local Windows/OneDrive dev: put build output in AppData to avoid EBUSY file-lock errors.
// On Vercel/CI: LOCALAPPDATA is not set and the fallback Windows path would resolve OUTSIDE
// the project root, which Turbopack refuses (Invalid distDirRoot). So skip custom distDir
// on CI/Vercel and use the default '.next'.
function resolveDistDir(): string | undefined {
  if (process.env.VERCEL || process.env.CI || !process.env.LOCALAPPDATA) {
    return undefined; // use default '.next'
  }
  const distAbsolute = path.join(process.env.LOCALAPPDATA, 'scorebarschedule-next');
  const rel = path.relative(process.cwd(), distAbsolute);
  // Safety check: never navigate outside the project (e.g. if someone runs locally on Linux)
  if (rel.startsWith('..')) return undefined;
  return rel;
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
