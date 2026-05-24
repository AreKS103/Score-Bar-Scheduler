import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserOrgId, getOrgMemberIds } from '@/lib/supabase/org';
import type { MatchEvent } from '@/types';
import { refreshWorldCupSnapshotEvents } from '@/lib/worldCup';

const MAX_HISTORY = 50; // per embed_target — keep full history

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = await getUserOrgId(user.id);

    const { weekLabel, dateRangeStart, dateRangeEnd, htmlContent, eventsSnapshot, leagueOrder, featuredLeagues, embedTarget, publishedAtLabel } = await req.json();
    if (!htmlContent || !eventsSnapshot) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const targetValue = (typeof embedTarget === 'string' && embedTarget.trim()) ? embedTarget.trim() : null;

    // Look up the user's display name from user_profiles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('user_id', user.id)
      .single();

    const { error: insertError } = await supabase.from('published_schedules').insert({
      user_id: user.id,
      organization_id: orgId,
      week_label: weekLabel || `${dateRangeStart} – ${dateRangeEnd}`,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      html_content: htmlContent,
      events_snapshot: eventsSnapshot,
      league_order: leagueOrder || [],
      featured_leagues: featuredLeagues || {},
      embed_target: targetValue,
      author_email: user.email ?? null,
      author_username: profile?.username ?? null,
      published_at_label: (typeof publishedAtLabel === 'string' && publishedAtLabel.trim()) ? publishedAtLabel.trim() : null,
    });

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // Prune old snapshots beyond MAX_HISTORY — pruning is org-scoped per embed_target
    const orgMemberIds = await getOrgMemberIds(user.id);
    const pruneQuery = supabase
      .from('published_schedules')
      .select('id')
      .in('user_id', orgMemberIds)
      .order('published_at', { ascending: false });

    const { data: all } = targetValue
      ? await pruneQuery.eq('embed_target', targetValue)
      : await pruneQuery.is('embed_target', null);

    if (all && all.length > MAX_HISTORY) {
      const toDelete = all.slice(MAX_HISTORY).map((s: { id: string }) => s.id);
      await supabase.from('published_schedules').delete().in('id', toDelete);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const target = req.nextUrl.searchParams.get('target');
    const orgMemberIds = await getOrgMemberIds(user.id);

    // ?target=xxx  → latest schedule for that embed_target (used by preview panel)
    if (target !== null) {
      const query = supabase
        .from('published_schedules')
        .select('id, week_label, date_range_start, date_range_end, published_at, events_snapshot, league_order, featured_leagues')
        .in('user_id', orgMemberIds)
        .order('published_at', { ascending: false })
        .limit(1);

      const { data, error } = target === ''
        ? await query.is('embed_target', null)
        : await query.eq('embed_target', target);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const schedule = data?.[0] ?? null;
      if (schedule && Array.isArray(schedule.events_snapshot)) {
        schedule.events_snapshot = await refreshWorldCupSnapshotEvents(schedule.events_snapshot as MatchEvent[]);
      }
      return NextResponse.json({ schedule }, {
        headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
      });
    }

    // No ?target → return history list (for PublishButton history drawer).
    // Returns the most-recent published schedule for each embed_target so the
    // drawer can show all embeds (e.g. "Homepage" + "Schedule Page") with labels.
    // MAX_HISTORY=1 per embed means there are at most N rows total (N = number of embeds).
    const { data, error } = await supabase
      .from('published_schedules')
      .select('id, week_label, date_range_start, date_range_end, published_at, published_at_label, embed_target, author_email, author_username')
      .in('user_id', orgMemberIds)
      .order('published_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ schedules: data ?? [] }, {
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
