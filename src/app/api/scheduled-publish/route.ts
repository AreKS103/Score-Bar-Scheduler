import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Store a scheduled publish for later execution */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { html, scheduledAt, weekLabel } = await req.json();

    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'Missing HTML content' }, { status: 400 });
    }
    if (!scheduledAt || isNaN(Date.parse(scheduledAt))) {
      return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
    }

    const { error } = await supabase.from('scheduled_publishes').insert({
      user_id: user.id,
      html_content: html,
      scheduled_at: scheduledAt,
      week_label: weekLabel || '',
      status: 'pending',
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

    const { data, error } = await supabase
      .from('scheduled_publishes')
      .select('id, scheduled_at, week_label, status, created_at')
      .eq('user_id', user.id)
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

    const { error } = await supabase
      .from('scheduled_publishes')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('user_id', user.id)
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
