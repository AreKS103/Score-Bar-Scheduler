import { createBrowserClient } from '@supabase/ssr';

// 45 days — forces auth cookies to survive browser restarts
const COOKIE_MAX_AGE = 45 * 24 * 60 * 60;

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.'
    );
  }

  return createBrowserClient(url, key, {
    cookieOptions: {
      maxAge: COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax' as const,
    },
  });
}
