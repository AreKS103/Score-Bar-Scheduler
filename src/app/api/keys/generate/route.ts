import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
          connected_site: null
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
  } catch (error: any) {
    console.error('[keys/generate] error:', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}