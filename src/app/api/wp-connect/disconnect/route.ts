import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
