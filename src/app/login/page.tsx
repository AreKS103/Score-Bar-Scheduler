'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'verify';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setError('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
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
            Click the link in that email to activate your account — you&apos;ll be signed in automatically.
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none mb-4 placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
          />

          {/* Confirm password (sign-up only) */}
          {mode === 'signup' && (
            <>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none mb-4 placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
              />
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
        </form>
      </div>
    </div>
  );
}

