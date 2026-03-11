import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

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

    // Find past-due pending publishes for this user only
    const { data: pending, error } = await db
      .from('scheduled_publishes')
      .select('id, html_content, week_label')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });

    if (error || !pending || pending.length === 0) {
      return NextResponse.json({ executed: 0 });
    }

    const siteUrl = process.env.WP_SITE_URL || 'https://scorekh.com';
    const username = process.env.WP_USERNAME;
    const appPassword = process.env.WP_APP_PASSWORD;

    if (!username || !appPassword) {
      return NextResponse.json({ error: 'WordPress credentials not configured' }, { status: 500 });
    }

    const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
    let executed = 0;

    for (const item of pending) {
      try {
        const wpRes = await fetch(`${siteUrl}/wp-json/score/v1/schedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({ html: item.html_content }),
        });

        if (wpRes.ok) {
          await db
            .from('scheduled_publishes')
            .update({ status: 'published', published_at: new Date().toISOString() })
            .eq('id', item.id);
          executed++;
        } else {
          const errText = await wpRes.text().catch(() => 'Unknown WP error');
          await db
            .from('scheduled_publishes')
            .update({ status: 'failed', error_message: errText.slice(0, 500) })
            .eq('id', item.id);
        }
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
