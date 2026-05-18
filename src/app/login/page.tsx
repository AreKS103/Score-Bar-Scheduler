'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'verify';

function getLoginErrorFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const urlError = params.get('error');

  if (urlError === 'invite_expired') {
    return 'This invite link has expired or was already used. Please ask your admin to send a new invite.';
  }
  if (urlError === 'verification_failed') {
    return 'Email verification failed. The link may have expired — please try signing up again.';
  }
  if (urlError === 'oauth_failed') {
    return 'Google sign-in failed. Please try again.';
  }
  if (urlError === 'oauth_state_expired') {
    return 'Sign-in session expired — please try again.';
  }
  if (urlError === 'oauth_email_exists') {
    return 'An account with this email already exists. Sign in with your email & password, then link Google under Settings → Account.';
  }

  return '';
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');

  // Auth routing: hand off invite/recovery tokens to the dedicated page,
  // and redirect already-signed-in users to /schedule.
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;

    // Invite / recovery / PKCE tokens → hand off to /auth/invite which handles
    // them with full error logging. window.location preserves the hash fragment
    // (router.replace/push would strip it).
    const hasHashTokens = hash.includes('access_token=') || hash.includes('refresh_token=');
    const hasCode = new URLSearchParams(search).has('code');

    if (hasHashTokens || hasCode) {
      console.log('[login] auth tokens detected — handing off to /auth/invite');
      window.location.replace('/auth/invite' + hash + search);
      return;
    }

    // Normal case: redirect already-authenticated users to the app
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) router.replace('/schedule');
    });
    return () => { cancelled = true; };
  }, [router]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempt, setFailedAttempt] = useState(false);

  // Show error from URL params (e.g. expired invite, failed verification)
  useEffect(() => {
    const urlError = getLoginErrorFromSearch(window.location.search);
    if (urlError) queueMicrotask(() => setError(urlError));
  }, []);

  const [showVerifyNotice, setShowVerifyNotice] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError('');
    setShowVerifyNotice(false);
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setError('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setFailedAttempt(true);
        setLoading(false);
        return;
      }
      // Check if email is verified
      if (signInData.user && !signInData.user.email_confirmed_at) {
        // Sign out the unverified user so they can't access the app
        await supabase.auth.signOut();
        setShowVerifyNotice(true);
        setLoading(false);
        return;
      }
      router.push('/schedule');
      router.refresh();
    } catch {
      setError('Network error — please try again');
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setGoogleLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setError('Supabase is not configured.');
        setGoogleLoading(false);
        return;
      }
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
      // On success the browser is redirected to Google — no further action needed here
    } catch {
      setError('Failed to initiate Google sign-in');
      setGoogleLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email) return;
    setResendingVerification(true);
    setResendSuccess(false);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (resendError) {
        setError(resendError.message);
      } else {
        setResendSuccess(true);
      }
    } catch {
      setError('Failed to resend verification email');
    }
    setResendingVerification(false);
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setError('Supabase is not configured.');
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes('already') || msg.includes('registered')) {
          // Email already exists — could be from Google OAuth. Guide the user.
          setError(
            'An account with this email already exists. If you signed up with Google, use "Continue with Google" above. Otherwise sign in with your password.',
          );
          setMode('signin');
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }
      setMode('verify');
      setLoading(false);
    } catch {
      setError('Network error — please try again');
      setLoading(false);
    }
  }

  // ── Email verification required screen ────────────────────────────────────
  if (showVerifyNotice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-95 bg-card rounded-2xl p-[2.5rem_2rem] border border-border shadow-2xl shadow-black/20 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-[20px] font-extrabold text-foreground tracking-tight mb-2">
            Email verification required
          </h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
            Your email <span className="font-semibold text-foreground">{email}</span> hasn&apos;t been verified yet.
            Please check your inbox for the verification link we sent when you signed up.
          </p>
          {resendSuccess ? (
            <p className="text-[13px] text-emerald-500 font-medium mb-4">
              ✓ Verification email sent! Check your inbox.
            </p>
          ) : (
            <button
              onClick={handleResendVerification}
              disabled={resendingVerification}
              className="mb-4 py-2 px-4 rounded-lg border border-border bg-secondary text-foreground text-sm font-semibold cursor-pointer transition-colors hover:bg-secondary/80 disabled:opacity-60 disabled:cursor-wait"
            >
              {resendingVerification ? 'Sending…' : 'Resend verification email'}
            </button>
          )}
          {error && (
            <div className="bg-destructive/12 border border-destructive/30 rounded-lg py-2 px-3 mb-4 text-[13px] text-destructive">
              {error}
            </div>
          )}
          <div>
            <button
              onClick={() => { setShowVerifyNotice(false); setError(''); setResendSuccess(false); }}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Verification pending screen ────────────────────────────────────────────
  if (mode === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-95 bg-card rounded-2xl p-[2.5rem_2rem] border border-border shadow-2xl shadow-black/20 text-center">
          <div className="text-4xl mb-4">📬</div>
          <h1 className="text-[20px] font-extrabold text-foreground tracking-tight mb-2">
            Check your inbox
          </h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">
            We sent a verification link to{' '}
            <span className="font-semibold text-foreground">{email}</span>.
            Click the link in that email to activate your account.
          </p>
          <button
            onClick={() => { setMode('signin'); setError(''); }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-95 bg-card rounded-2xl p-[2.5rem_2rem] border border-border shadow-2xl shadow-black/20">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-[22px] font-extrabold text-foreground tracking-tight m-0">
            Scheduler
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            {mode === 'signin' ? 'Sign in to manage your schedules' : 'Create a new account'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 p-1 bg-secondary rounded-lg">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
              mode === 'signin'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
              mode === 'signup'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/12 border border-destructive/30 rounded-lg py-2 px-3 mb-4 text-[13px] text-destructive">
            {error}
          </div>
        )}

        {/* Google sign-in */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-wait mb-4"
        >
          {googleLoading ? (
            <svg className="w-4 h-4 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-muted-foreground font-medium">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
          {/* Email */}
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none mb-4 placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
          />

          {/* Password */}
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Password
          </label>
          <div className="relative mb-4">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 pr-10 rounded-lg border border-border bg-background text-foreground text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Confirm password (sign-up only) */}
          {mode === 'signup' && (
            <>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Confirm Password
              </label>
              <div className="relative mb-4">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 rounded-lg border border-border bg-background text-foreground text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded-lg border-none bg-primary text-primary-foreground text-sm font-bold cursor-pointer transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait"
          >
            {loading
              ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
              : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>

          {mode === 'signin' && (
            <div className="text-center mt-3">
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Forgot your password?
              </Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

