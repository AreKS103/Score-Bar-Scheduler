import { withSentryConfig } from '@sentry/nextjs';
import withBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import path from 'path';

// Older local Windows/OneDrive builds used an AppData distDir to avoid file-lock
// errors. Newer Turbopack builds reject distDir values outside the project, so
// keep that workaround opt-in and fall back to the normal in-project '.next'.
function resolveDistDir(): string | undefined {
  if (process.env.VERCEL || process.env.CI || process.env.SCOREBAR_EXTERNAL_NEXT_DIR !== '1' || !process.env.LOCALAPPDATA) {
    return undefined; // Vercel / CI: use default '.next'
  }
  const target = path.join(process.env.LOCALAPPDATA, 'scorebarschedule-next');
  const relativeTarget = path.relative(process.cwd(), target);
  return relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget) ? undefined : relativeTarget;
}

const distDir = resolveDistDir();

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  async headers() {
    return [
      {
        source: '/league-logos/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' },
        ],
      },
      {
        // Security headers for all routes except embeds
        source: '/((?!embed).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
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
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

const analyzed = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })(nextConfig);

export default withSentryConfig(analyzed, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "alex-inc-9p",

  project: "sentry-champagne-papi",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,
});
