import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Supabase email-verification callback.
 * After the user clicks the link in their inbox, Supabase redirects here
 * with ?token_hash=...&type=signup (or email_change / recovery).
 * We exchange the token for a real session then forward to the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/schedule';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // Verification succeeded — redirect into the app
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Something went wrong — send back to login with an error hint
  return NextResponse.redirect(new URL('/login?error=verification_failed', origin));
}
