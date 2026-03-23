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
    // Works for both public and private repos.
    const dlHeaders: Record<string, string> = {
      Accept: 'application/octet-stream',
      'User-Agent': 'ScoreBarScheduler-UpdateChecker/1.0',
    };
    if (process.env.GITHUB_TOKEN) {
      dlHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const zipRes = await fetch(zipAsset.browser_download_url, {
      headers: dlHeaders,
      redirect: 'follow',
    });
    console.log('[download] GitHub fetch status:', zipRes?.status);
    console.log('[download] GitHub fetch ok:', zipRes?.ok);
    console.log('[download] token present:', !!process.env.GITHUB_TOKEN);
    console.log('[download] token prefix:', process.env.GITHUB_TOKEN?.substring(0, 4));
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
