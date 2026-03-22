import type { NextConfig } from 'next';
import path from 'path';

// Put build output outside OneDrive to prevent EBUSY file-lock errors during sync.
// Next.js internally does path.join(projectRoot, distDir) so we must supply a
// *relative* path — an absolute path with a drive letter gets treated as a literal
// path segment on Windows (path.join, not path.resolve).
const appDataLocal = process.env.LOCALAPPDATA || path.join('C:', 'Users', 'alpla', 'AppData', 'Local');
const distAbsolute = path.join(appDataLocal, 'scorebarschedule-next');
const distDir = path.relative(process.cwd(), distAbsolute);

const nextConfig: NextConfig = {
  distDir,
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
