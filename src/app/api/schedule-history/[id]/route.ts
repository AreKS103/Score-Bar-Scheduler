import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrgMemberIds } from '@/lib/supabase/org';
import type { MatchEvent } from '@/types';
import { WORLD_CUP_SPORT_ID } from '@/lib/worldCup';
import { generateHTML } from '@/lib/generateHTML';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const orgMemberIds = await getOrgMemberIds(user.id);

    const { data, error } = await supabase
      .from('published_schedules')
      .select('id, week_label, date_range_start, date_range_end, published_at, html_content, events_snapshot, league_order, featured_leagues, embed_target, author_email, author_username')
      .eq('id', id)
      .in('user_id', orgMemberIds)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const events = Array.isArray(data.events_snapshot)
      ? (data.events_snapshot as MatchEvent[]).filter((event) => event?.sportId !== WORLD_CUP_SPORT_ID)
      : [];
    const leagueOrder = Array.isArray(data.league_order) ? data.league_order as string[] : [];
    const featuredLeagues = data.featured_leagues && typeof data.featured_leagues === 'object'
      ? data.featured_leagues as Record<string, string>
      : {};
    data.events_snapshot = events;
    data.html_content = generateHTML(
      events,
      leagueOrder,
      new Map(Object.entries(featuredLeagues)),
      typeof data.embed_target === 'string' ? data.embed_target : undefined,
    );
    return NextResponse.json({ schedule: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
