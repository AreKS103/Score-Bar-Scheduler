import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrgMemberIds } from '@/lib/supabase/org';

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
    return NextResponse.json({ schedule: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
