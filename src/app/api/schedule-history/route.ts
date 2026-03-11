import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_HISTORY = 4;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { weekLabel, dateRangeStart, dateRangeEnd, htmlContent, eventsSnapshot, leagueOrder, featuredLeagues } = await req.json();
    if (!htmlContent || !eventsSnapshot) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { error: insertError } = await supabase.from('published_schedules').insert({
      user_id: user.id,
      week_label: weekLabel || `${dateRangeStart} – ${dateRangeEnd}`,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      html_content: htmlContent,
      events_snapshot: eventsSnapshot,
      league_order: leagueOrder || [],
      featured_leagues: featuredLeagues || {},
    });

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // Prune old snapshots beyond MAX_HISTORY
    const { data: all } = await supabase
      .from('published_schedules')
      .select('id')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false });

    if (all && all.length > MAX_HISTORY) {
      const toDelete = all.slice(MAX_HISTORY).map((s) => s.id);
      await supabase.from('published_schedules').delete().in('id', toDelete);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('published_schedules')
      .select('id, week_label, date_range_start, date_range_end, published_at')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false })
      .limit(4);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ schedules: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
