import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserOrgId, getOrgMemberIds } from '@/lib/supabase/org';
import type { MatchEvent } from '@/types';

const BUCKET = 'custom-league-logos';

function getLogoPath(event: MatchEvent | null | undefined): string | null {
  const path = event?.customLogoPath;
  return typeof path === 'string' && path.length > 0 ? path : null;
}

/** Save a new custom event */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const event: MatchEvent = await req.json();
    if (!event?.id || !event?.date) {
      return NextResponse.json({ error: 'Invalid event data' }, { status: 400 });
    }

    // Idempotent save by MatchEvent.id to avoid duplicates on retries.
    const { data: existing } = await supabase
      .from('custom_events')
      .select('id, event_data')
      .eq('user_id', user.id)
      .eq('event_data->>id', event.id)
      .maybeSingle();

    if (existing?.id) {
      const previousEvent = existing.event_data as MatchEvent;
      const previousLogoPath = getLogoPath(previousEvent);
      const nextLogoPath = getLogoPath(event);

      const { error: updateError } = await supabase
        .from('custom_events')
        .update({
          event_data: event,
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('[CustomEvents] update error:', updateError);
        return NextResponse.json({ error: updateError.message || 'Failed to update event' }, { status: 500 });
      }

      if (previousLogoPath && previousLogoPath !== nextLogoPath) {
        await supabase.storage.from(BUCKET).remove([previousLogoPath]);
      }

      return NextResponse.json({ success: true, rowId: existing.id, updated: true });
    }

    const orgId = await getUserOrgId(user.id);

    const { data, error } = await supabase
      .from('custom_events')
      .insert({
        user_id: user.id,
        organization_id: orgId,
        event_data: event,
        // expires_at defaults to now() + 14 days in the DB
      })
      .select('id')
      .single();

    if (error) {
      console.error('[CustomEvents] insert error:', error);
      return NextResponse.json({ error: error.message || 'Failed to save event' }, { status: 500 });
    }

    return NextResponse.json({ success: true, rowId: data.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

/** Fetch all non-expired custom events for the current user */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgMemberIds = await getOrgMemberIds(user.id);

    // Cleanup expired rows (+ stored logos) probabilistically (~5% of requests).
    // Running this on every GET added 1-2 extra Supabase round-trips to the
    // hot path; sampling keeps the cleanup happening regularly without taxing
    // every page load.
    if (Math.random() < 0.05) {
      const { data: expiredRows } = await supabase
        .from('custom_events')
        .select('id, event_data')
        .in('user_id', orgMemberIds)
        .lte('expires_at', new Date().toISOString());

      if (expiredRows && expiredRows.length > 0) {
        const expiredIds = expiredRows.map((r) => r.id);
        const logoPaths = expiredRows
          .map((r) => getLogoPath(r.event_data as MatchEvent))
          .filter((v): v is string => Boolean(v));

        await supabase.from('custom_events').delete().in('id', expiredIds);
        if (logoPaths.length > 0) {
          await supabase.storage.from(BUCKET).remove(Array.from(new Set(logoPaths)));
        }
      }
    }

    const { data, error } = await supabase
      .from('custom_events')
      .select('id, event_data, expires_at')
      .in('user_id', orgMemberIds)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    const events: MatchEvent[] = (data ?? []).map(row => ({
      ...(row.event_data as MatchEvent),
      _rowId: row.id,
      _expiresAt: row.expires_at,
    }));

    return NextResponse.json({ events }, {
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

/** Delete one or more custom events by MatchEvent.id (event_data->>id). */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null) as { eventId?: string; eventIds?: string[] } | null;
    const ids = Array.from(new Set([
      ...(typeof body?.eventId === 'string' ? [body.eventId] : []),
      ...(Array.isArray(body?.eventIds) ? body!.eventIds.filter((v): v is string => typeof v === 'string' && v.length > 0) : []),
    ]));
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Missing eventId/eventIds' }, { status: 400 });
    }

    const orgMemberIds = await getOrgMemberIds(user.id);

    const { data: rows } = await supabase
      .from('custom_events')
      .select('id, event_data')
      .in('user_id', orgMemberIds)
      .in('event_data->>id', ids);

    const matchedEventIds = (rows ?? [])
      .map((r) => (r.event_data as MatchEvent)?.id)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);

    if (matchedEventIds.length === 0) {
      return NextResponse.json({ success: true, deletedEventIds: [] });
    }

    // Match on the event_data->>'id' JSONB field
    const { error } = await supabase
      .from('custom_events')
      .delete()
      .in('user_id', orgMemberIds)
      .in('event_data->>id', matchedEventIds);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }

    const logoPaths = (rows ?? [])
      .map((r) => getLogoPath(r.event_data as MatchEvent))
      .filter((v): v is string => Boolean(v));

    if (logoPaths.length > 0) {
      await supabase.storage.from(BUCKET).remove(Array.from(new Set(logoPaths)));
    }

    return NextResponse.json({ success: true, deletedEventIds: matchedEventIds });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
