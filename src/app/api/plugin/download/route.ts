import { NextResponse } from 'next/server';

const GITHUB_REPO = 'AreKS103/Score-Bar-Scheduler';
const RELEASE_TAG = 'plugin-latest';

// No caching — always serve the latest zip.
export const dynamic = 'force-dynamic';

// Allow up to 30 s for the two GitHub API calls + full download.
export const maxDuration = 30;

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

    // 1. Fetch release metadata to find the zip asset ID.
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

    // 2. Download the zip via the GitHub Assets API.
    //    Uses asset ID + application/octet-stream to avoid S3 redirect issues
    //    with Authorization headers on private repos.
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
    if (!zipRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch zip from GitHub' }, { status: 502 });
    }

    // 3. Buffer the entire zip so we can set Content-Length.
    //    The zip is small (~30 KB), so buffering is fine and avoids
    //    streaming/chunked-encoding issues that break WordPress's download_url().
    const zipBuffer = await zipRes.arrayBuffer();

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(zipBuffer.byteLength),
        'Content-Disposition': 'attachment; filename="scorebar-scheduler.zip"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
