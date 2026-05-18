import { NextRequest, NextResponse } from 'next/server';
import { fetchWorldCupFixtures } from '@/lib/worldCup';

export async function GET(req: NextRequest) {
  const timeZone = req.nextUrl.searchParams.get('timeZone');
  const payload = await fetchWorldCupFixtures(timeZone);

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
    },
  });
}