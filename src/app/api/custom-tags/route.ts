import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ tags: [] });

  const { data } = await supabase
    .from('custom_tags')
    .select('tags')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ tags: data?.tags ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { tags?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { tags } = body;
  if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string')) {
    return NextResponse.json({ error: 'tags must be string[]' }, { status: 400 });
  }

  const { error } = await supabase
    .from('custom_tags')
    .upsert(
      { user_id: user.id, tags, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
