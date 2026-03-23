import { type NextRequest, NextResponse } from 'next/server';

// GitHub repo hosting the plugin source (used to fetch release metadata).
const GITHUB_REPO = 'AreKS103/Score-Bar-Scheduler';
const RELEASE_TAG = 'plugin-latest';

// No edge cache — always fetch fresh from GitHub so WordPress sees new versions immediately.
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ScoreBarScheduler-UpdateChecker/1.0',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${RELEASE_TAG}`,
      { headers },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Plugin release not found', status: res.status },
        { status: 404 },
      );
    }

    const release = await res.json();

    // Version is embedded in the release body by the GitHub Actions workflow.
    const versionMatch = (release.body as string | undefined)?.match(
      /Plugin version:\s*([\d.]+)/,
    );
    const version = versionMatch?.[1] ?? '1.0.0';

    const zipAsset = (release.assets ?? []).find((a: { name: string }) =>
      a.name.endsWith('.zip'),
    );

    if (!zipAsset) {
      return NextResponse.json({ error: 'No zip asset in release' }, { status: 404 });
    }

    // Route the download through our own proxy so it works for both public and
    // private GitHub repos (the proxy uses GITHUB_TOKEN server-side).
    const origin = req.nextUrl.origin;
    const downloadUrl = `${origin}/api/plugin/download`;

    return NextResponse.json({
      version,
      download_url: downloadUrl,
      slug: 'scorebar-scheduler',
      url: `https://github.com/${GITHUB_REPO}`,
      requires: '6.0',
      tested: '6.7',
      requires_php: '7.4',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch release metadata' }, { status: 500 });
  }
}
