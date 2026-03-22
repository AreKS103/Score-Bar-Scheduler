import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createServerClient(supabaseUrl, serviceKey);

  const { data: pending, error } = await supabase
    .from('scheduled_publishes')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (error || !pending || pending.length === 0) {
    return NextResponse.json({ executed: 0 });
  }

  let executed = 0;

  for (const item of pending) {
    try {
      const { error: insertErr } = await supabase.from('published_schedules').insert({
        user_id: item.user_id,
        week_label: item.week_label || '',
        date_range_start: item.date_range_start || '',
        date_range_end: item.date_range_end || '',
        html_content: item.html_content,
        events_snapshot: item.events_snapshot || [],
        league_order: item.league_order || [],
        featured_leagues: item.featured_leagues || {},
        published_at: new Date().toISOString(),
      });

      if (insertErr) throw insertErr;

      await supabase
        .from('scheduled_publishes')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', item.id);
        
      executed++;
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
