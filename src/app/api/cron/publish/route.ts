import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@supabase/supabase-js';

/**
 * Cron endpoint — executes pending scheduled publishes whose time has arrived.
 * Called by Vercel Cron (every minute) or manually.
 * Uses service-role key to bypass RLS since this runs without a user session.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createServerClient(supabaseUrl, serviceKey);

  // Fetch all pending publishes whose scheduled_at has passed
  const { data: pending, error } = await supabase
    .from('scheduled_publishes')
    .select('id, html_content, week_label, user_id')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (error || !pending) {
    return NextResponse.json({ error: 'Failed to query schedules', detail: error?.message }, { status: 500 });
  }

  if (pending.length === 0) {
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
        await supabase
          .from('scheduled_publishes')
          .update({ status: 'published', published_at: new Date().toISOString() })
          .eq('id', item.id);
        executed++;
      } else {
        const errText = await wpRes.text().catch(() => 'Unknown WP error');
        await supabase
          .from('scheduled_publishes')
          .update({ status: 'failed', error_message: errText.slice(0, 500) })
          .eq('id', item.id);
      }
    } catch (err) {
      await supabase
        .from('scheduled_publishes')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message.slice(0, 500) : 'Unknown error',
        })
        .eq('id', item.id);
    }
  }

  return NextResponse.json({ executed, total: pending.length });
}
