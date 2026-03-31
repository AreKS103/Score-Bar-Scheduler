import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Rate limiter: 20 profile updates per hour per user
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 3_600_000; // 1 hour
const userRequests = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = (userRequests.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  userRequests.set(userId, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('username, avatar_url')
      .eq('user_id', user.id)
      .single();

    // Auto-sync OAuth avatar_url from user metadata into user_profiles if
    // it's not stored yet (covers users who signed in before migration 034)
    const metaAvatar = user.user_metadata?.avatar_url as string | undefined;
    if (metaAvatar && !profile?.avatar_url) {
      // Fire-and-forget: sync avatar from metadata into user_profiles.
      // Two-arg .then() handles rejection inline (PromiseLike has no .catch()).
      supabase.from('user_profiles').upsert(
        { user_id: user.id, avatar_url: metaAvatar, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      ).then(() => {}, () => {});
    }

    return NextResponse.json({
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? metaAvatar ?? null,
      email: user.email ?? null,
      displayName: profile?.username || user.email || null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (isRateLimited(user.id)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { username } = await req.json();
    if (typeof username !== 'string') {
      return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
    }

    const trimmed = username.trim();
    // Allow empty string to clear username (falls back to email)
    const value = trimmed || null;

    // Validate username length
    if (value && value.length > 50) {
      return NextResponse.json({ error: 'Username must be 50 characters or less' }, { status: 400 });
    }

    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        username: value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      username: value,
      displayName: value || user.email || null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
