import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Rate limiter: 5 disconnect requests per hour per user
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 3_600_000; // 1 hour
const userRequests = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = (userRequests.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  userRequests.set(userId, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

/**
 * DELETE /api/wp-connect/disconnect
 *
 * Clears the connected_site for the authenticated user,
 * effectively disconnecting their WordPress site.
 *
 * Returns: { ok: true } or { error: string }
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { error } = await supabase
      .from('user_api_keys')
      .update({ connected_site: null })
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to disconnect.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
