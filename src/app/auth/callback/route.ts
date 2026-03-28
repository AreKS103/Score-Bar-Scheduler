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
  const code = searchParams.get('code');

  // Allow callers to pass a safe relative `next` redirect (used by future deep links)
  const rawNext = searchParams.get('next') ?? '/schedule';
  // Security: only allow relative paths to prevent open-redirect attacks
  const next = rawNext.startsWith('/') ? rawNext : '/schedule';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // When deployed behind a load-balancer/proxy (Vercel), the `origin` parsed
      // from the request URL is the internal upstream origin, not the public one.
      // x-forwarded-host carries the real public hostname in that case.
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocal = process.env.NODE_ENV === 'development';

      if (isLocal) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }

    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
  } else {
    console.warn('[auth/callback] no code param in request');
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
