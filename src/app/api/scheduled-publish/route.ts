import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserOrgId, getOrgMemberIds } from '@/lib/supabase/org';

/** Store a scheduled publish for later execution */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = await getUserOrgId(user.id);

    const { html, scheduledAt, weekLabel, dateRangeStart, dateRangeEnd, eventsSnapshot, leagueOrder, featuredLeagues, embedTarget } = await req.json();

    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'Missing HTML content' }, { status: 400 });
    }
    if (!scheduledAt || isNaN(Date.parse(scheduledAt))) {
      return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
    }

    const targetValue = (typeof embedTarget === 'string' && embedTarget.trim()) ? embedTarget.trim() : null;

    const { error } = await supabase.from('scheduled_publishes').insert({
      user_id: user.id,
      organization_id: orgId,
      html_content: html,
      scheduled_at: scheduledAt,
      week_label: weekLabel || '',
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      events_snapshot: eventsSnapshot,
      league_order: leagueOrder || [],
      featured_leagues: featuredLeagues || {},
      status: 'pending',
      embed_target: targetValue,
    });

    if (error) {
      console.error('[ScheduledPublish] insert error:', error);
      return NextResponse.json({ error: 'Failed to save schedule' }, { status: 500 });
    }

    return NextResponse.json({ success: true, scheduledAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Get pending scheduled publishes for the current user */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgMemberIds = await getOrgMemberIds(user.id);

    const { data, error } = await supabase
      .from('scheduled_publishes')
      .select('id, scheduled_at, week_label, status, created_at, embed_target')
      .in('user_id', orgMemberIds)
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
    }

    return NextResponse.json({ schedules: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Cancel a scheduled publish */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await req.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing schedule ID' }, { status: 400 });
    }

    const orgMemberIds = await getOrgMemberIds(user.id);

    const { error } = await supabase
      .from('scheduled_publishes')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .in('user_id', orgMemberIds)
      .eq('status', 'pending');

    if (error) {
      return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Execute any past-due scheduled publishes for the current user.
 * Called client-side on page load as a workaround for Vercel Hobby cron limits.
 * Uses the service role key to bypass RLS for updating status after publish.
 */
export async function PATCH() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Use service client if available, fallback to user client
    const db = (supabaseUrl && serviceKey)
      ? createServiceClient(supabaseUrl, serviceKey)
      : supabase;

    // Find past-due pending publishes for all org members
    const orgMemberIds = await getOrgMemberIds(user.id);
    const { data: pending, error } = await db
      .from('scheduled_publishes')
      .select('*')
      .in('user_id', orgMemberIds)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });

    if (error || !pending || pending.length === 0) {
      return NextResponse.json({ executed: 0 });
    }

    let executed = 0;

    for (const item of pending) {
      try {
        // Move to published_schedules
        const { error: insertErr } = await db.from('published_schedules').insert({
          user_id: item.user_id,
          week_label: item.week_label || '',
          date_range_start: item.date_range_start || '',
          date_range_end: item.date_range_end || '',
          html_content: item.html_content,
          events_snapshot: item.events_snapshot || [],
          league_order: item.league_order || [],
          featured_leagues: item.featured_leagues || {},
          published_at: new Date().toISOString(),
          embed_target: item.embed_target || null,
        });

        if (insertErr) throw insertErr;

        await db
          .from('scheduled_publishes')
          .update({ status: 'published', published_at: new Date().toISOString() })
          .eq('id', item.id);
        
        executed++;
      } catch (err) {
        await db
          .from('scheduled_publishes')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message.slice(0, 500) : 'Unknown error',
          })
          .eq('id', item.id);
      }
    }

    return NextResponse.json({ executed, total: pending.length });
  } catch (err) {
    console.error('[scheduled-publish] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
