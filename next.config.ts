import { withSentryConfig } from '@sentry/nextjs';
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

export default withSentryConfig(nextConfig, {
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

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
