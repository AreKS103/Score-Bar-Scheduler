import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserOrgId } from '@/lib/supabase/org';
import crypto from 'crypto';

// Rate limiter: 10 key generations per 24 hours per user
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 86_400_000; // 24 hours
const userRequests = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = (userRequests.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  userRequests.set(userId, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json({ error: 'Too many key generation requests' }, { status: 429 });
    }

    // Get user's org if they have one (no auto-creation)
    const orgId = await getUserOrgId(user.id);

    // Generate plain key
    const randomBytes = crypto.randomBytes(24).toString('hex');
    const plainKey = 'sb_live_' + randomBytes;
    
    // Hash it
    const hash = crypto.createHash('sha256').update(plainKey).digest('hex');
    const preview = 'sb_live_***************************' + plainKey.slice(-4);

    const { error } = await supabase
      .from('user_api_keys')
      .upsert(
        { 
          user_id: user.id, 
          key_hash: hash,
          key_preview: preview,
          connected_site: null,
          organization_id: orgId
        }, 
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[keys/generate] DB error:', error.message);
      return NextResponse.json({ error: 'Failed to generate API key' }, { status: 500 });
    }

    // Return plain key ONLY ONCE. 
    return NextResponse.json({ 
      apiKey: plainKey, 
      preview: preview
    });
  } catch (error: unknown) {
    console.error('[keys/generate] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}