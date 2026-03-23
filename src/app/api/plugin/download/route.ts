import { NextResponse } from 'next/server';

const GITHUB_REPO = 'AreKS103/Score-Bar-Scheduler';
const RELEASE_TAG = 'plugin-latest';

// No caching — always stream the latest zip.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiHeaders: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ScoreBarScheduler-UpdateChecker/1.0',
    };
    if (process.env.GITHUB_TOKEN) {
      apiHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    // Fetch release metadata to get the asset download URL.
    const metaRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${RELEASE_TAG}`,
      { headers: apiHeaders },
    );
    if (!metaRes.ok) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 });
    }

    const release = await metaRes.json();
    const zipAsset = (release.assets ?? []).find((a: { name: string }) =>
      a.name.endsWith('.zip'),
    );
    if (!zipAsset) {
      return NextResponse.json({ error: 'No zip asset in release' }, { status: 404 });
    }

    // Proxy the download server-side so WordPress never needs a GitHub token.
    // Use the GitHub Assets API endpoint (with asset ID) instead of browser_download_url.
    // browser_download_url redirects to S3 and fetch() strips the Authorization header
    // on redirect, causing 403 for private repos. The API endpoint returns bytes directly.
    const assetHeaders: Record<string, string> = {
      'Accept': 'application/octet-stream',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ScoreBarScheduler-UpdateChecker/1.0',
    };
    if (process.env.GITHUB_TOKEN) {
      assetHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const zipRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${zipAsset.id}`,
      {
        headers: assetHeaders,
        redirect: 'follow',
      },
    );
    if (!zipRes.ok || !zipRes.body) {
      return NextResponse.json({ error: 'Failed to fetch zip from GitHub' }, { status: 502 });
    }

    return new NextResponse(zipRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="scorebar-scheduler.zip"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
