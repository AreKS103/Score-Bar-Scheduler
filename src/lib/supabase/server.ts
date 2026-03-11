import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const COOKIE_MAX_AGE = 45 * 24 * 60 * 60;

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookieOptions: {
      maxAge: COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax' as const,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, maxAge: COOKIE_MAX_AGE })
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
    },
  });
}

