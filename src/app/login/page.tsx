'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'verify';

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
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError === 'invite_expired') {
      setError('This invite link has expired or was already used. Please ask your admin to send a new invite.');
    } else if (urlError === 'verification_failed') {
      setError('Email verification failed. The link may have expired — please try signing up again.');
    }
  }, []);

  const [showVerifyNotice, setShowVerifyNotice] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

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
        setError(authError.message);
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

