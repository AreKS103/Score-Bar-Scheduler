import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MatchEvent } from '@/types';

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
      .select('id')
      .eq('user_id', user.id)
      .eq('event_data->>id', event.id)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ success: true, rowId: existing.id, existing: true });
    }

    const { data, error } = await supabase
      .from('custom_events')
      .insert({
        user_id: user.id,
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

    const { data, error } = await supabase
      .from('custom_events')
      .select('id, event_data, expires_at')
      .eq('user_id', user.id)
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

    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

/** Delete a custom event by its event ID (the MatchEvent.id field) */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { eventId } = await req.json();
    if (!eventId || typeof eventId !== 'string') {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    // Match on the event_data->>'id' JSONB field
    const { error } = await supabase
      .from('custom_events')
      .delete()
      .eq('user_id', user.id)
      .eq('event_data->>id', eventId);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
