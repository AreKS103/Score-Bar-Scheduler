import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_MAX_AGE = 45 * 24 * 60 * 60; // 45 days

export async function updateSession(request: NextRequest) {
  // Skip all auth logic when Supabase is not configured yet
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request });
  }

  // Wrap everything in try/catch so a Supabase outage or bad token never
  // causes a 404/500 — worst case we fall through to the page as-is.
  try {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        maxAge: COOKIE_MAX_AGE,
        path: '/',
        sameSite: 'lax' as const,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: COOKIE_MAX_AGE,
            })
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow access to login page without auth
  if (request.nextUrl.pathname === '/login') {
    // If already logged in, redirect to schedule
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = '/schedule';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Allow embed pages (served in iframes on external sites)
  if (request.nextUrl.pathname.startsWith('/embed/')) {
    return supabaseResponse;
  }

  // Allow email-verification callback (must run before session is established)
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return supabaseResponse;
  }

  // Allow API routes for auth and public endpoints
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return supabaseResponse;
  }

  // Allow static files and Next.js internals
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/favicon') ||
    request.nextUrl.pathname.match(/\.(png|jpg|svg|ico)$/)
  ) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
  } catch (err) {
    // If anything goes wrong (network error, malformed token, etc.) just
    // allow the request through instead of surfacing a 404/500.
    console.error('[Middleware] updateSession error — falling through:', err);
    return NextResponse.next({ request });
  }
}
