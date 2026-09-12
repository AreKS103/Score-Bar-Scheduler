import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_MAX_AGE = 45 * 24 * 60 * 60; // 45 days

function bypassesAuthentication(path: string): boolean {
  return (
    path === '/embed' ||
    path.startsWith('/embed/') ||
    path === '/auth' ||
    path.startsWith('/auth/') ||
    path === '/api' ||
    path.startsWith('/api/') ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    Boolean(path.match(/\.(?:png|jpe?g|gif|webp|svg|ico)$/))
  );
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public request paths do not need a session refresh. Return before creating
  // a Supabase client so embeds and public assets avoid an auth network call.
  if (bypassesAuthentication(path)) {
    return NextResponse.next({ request });
  }

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
        secure: process.env.NODE_ENV === 'production',
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

  // Allow welcome page — it does its own session check client-side
  // (invite flow: session cookies may not be flushed when redirect arrives)
  if (request.nextUrl.pathname === '/welcome') {
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
    // Fail open only for public surfaces. Protected app pages must not load
    // as authenticated when getUser() throws (outage / malformed token).
    console.error('[Middleware] updateSession error:', err);
    const isPublic =
      path === '/login' ||
      path === '/welcome' ||
      bypassesAuthentication(path);
    if (isPublic) {
      return NextResponse.next({ request });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
}
