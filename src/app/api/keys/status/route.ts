import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/keys/status
 *
 * Returns the current user's API key preview and connection status.
 * Does NOT return the actual key (it's stored as a hash).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data } = await supabase
      .from('user_api_keys')
      .select('key_preview, connected_site, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ hasKey: false });
    }

    return NextResponse.json({
      hasKey: true,
      keyPreview: data.key_preview,
      connectedSite: data.connected_site,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error('[keys/status] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
