import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth PKCE callback route.
 *
 * Supabase redirects here after the user approves Google (or any OAuth provider)
 * with ?code=<pkce-code>[&next=<relative-path>].
 *
 * We exchange the code for a session server-side (sets cookies), then redirect
 * the user into the app. On failure, we send them back to /login with an error.
 *
 * Why server-side (Route Handler) instead of client-side:
 *   – @supabase/ssr requires the code exchange to happen in a context where
 *     cookies can be set on the response, which is only possible server-side.
 *   – This is the pattern documented by Supabase for Next.js App Router + PKCE.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // Resolve the public base URL (handles Vercel proxy where origin is internal)
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocal = process.env.NODE_ENV === 'development';
  const base = isLocal ? origin : forwardedHost ? `https://${forwardedHost}` : origin;

  // ── Handle errors that Supabase itself redirects back with ───────────────
  // e.g. bad_oauth_state, invalid_request, expired session — Supabase appends
  // ?error=...&error_description=... to the redirect URL instead of ?code=...
  const supabaseError = searchParams.get('error');
  if (supabaseError) {
    const desc = searchParams.get('error_description') ?? '';
    console.error('[auth/callback] Supabase OAuth error:', supabaseError, '-', desc);
    const isStateError =
      supabaseError === 'invalid_request' ||
      desc.toLowerCase().includes('state') ||
      desc.toLowerCase().includes('expired');
    return NextResponse.redirect(
      `${base}/login?error=${isStateError ? 'oauth_state_expired' : 'oauth_failed'}`,
    );
  }

  // Allow callers to pass a safe relative `next` redirect (used by future deep links)
  const rawNext = searchParams.get('next') ?? '/schedule';
  // Security: only allow relative paths to prevent open-redirect attacks
  const next = rawNext.startsWith('/') ? rawNext : '/schedule';

  const code = searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Sync Google (or any OAuth provider) avatar_url into user_profiles so
      // org member lists can display it without querying auth.users.
      const avatarUrl = sessionData?.user?.user_metadata?.avatar_url as string | undefined;
      const userId = sessionData?.user?.id;
      if (userId && avatarUrl) {
        // Fire-and-forget — don't block the redirect on this
        supabase.from('user_profiles').upsert(
          { user_id: userId, avatar_url: avatarUrl, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        ).then(() => {}).catch(() => {});
      }

      return NextResponse.redirect(`${base}${next}`);
    }

    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);

    // Detect duplicate-email / already-registered errors so the login page can
    // show a helpful "link your accounts" message instead of a generic failure.
    const msg = error.message?.toLowerCase() ?? '';
    const isDuplicate =
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('exists') ||
      msg.includes('identity_already_exists') ||
      msg.includes('user already');

    if (isDuplicate) {
      return NextResponse.redirect(`${base}/login?error=oauth_email_exists`);
    }
  } else {
    console.warn('[auth/callback] no code param in request');
  }

  return NextResponse.redirect(`${base}/login?error=oauth_failed`);
}
