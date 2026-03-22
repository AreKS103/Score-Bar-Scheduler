import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Clears the published schedule for a given embed target:
 *  1. Deletes the row from `published_schedules` in Supabase
 *  2. Optionally posts empty HTML to WordPress (if WP credentials are configured)
 *
 * Body: { embedTarget?: string | null }
 *   - embedTarget absent / null → deletes the global (NULL) schedule
 *   - embedTarget = 'main'     → deletes only the 'main' embed's schedule
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse optional embedTarget from body (gracefully handle empty body)
    let embedTarget: string | null = null;
    try {
      const body = await req.json();
      embedTarget = (typeof body?.embedTarget === 'string' && body.embedTarget.trim())
        ? body.embedTarget.trim()
        : null;
    } catch {
      // No body / malformed body → treat as global (null) target
    }

    // ── Delete from published_schedules ──────────────────────────────────────
    const deleteQuery = supabase
      .from('published_schedules')
      .delete()
      .eq('user_id', user.id);

    if (embedTarget) {
      await deleteQuery.eq('embed_target', embedTarget);
    } else {
      await deleteQuery.is('embed_target', null);
    }

    // ── Also clear WordPress display (best-effort, non-fatal) ────────────────
    const siteUrl = process.env.WP_SITE_URL || '';
    const username = process.env.WP_USERNAME;
    const appPassword = process.env.WP_APP_PASSWORD;

    if (username && appPassword) {
      const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
      try {
        await fetch(`${siteUrl}/wp-json/scheduler/v1/schedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({ html: '' }),
        });
      } catch {
        // WordPress unreachable — DB row is already deleted, that's the important part
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[delete-schedule]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

