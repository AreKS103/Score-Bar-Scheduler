'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!isSupabaseConfigured()) {
      setError('Service is not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm bg-card rounded-2xl p-[2.5rem_2rem] border border-border shadow-2xl shadow-black/20 text-center">
          <div className="text-4xl mb-4">📬</div>
          <h1 className="text-[20px] font-extrabold text-foreground tracking-tight mb-2">
            Check your inbox
          </h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">
            We sent a password reset link to{' '}
            <span className="font-semibold text-foreground">{email}</span>.
            Click the link in that email to reset your password.
          </p>
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl p-[2.5rem_2rem] border border-border shadow-2xl shadow-black/20">
        <div className="text-center mb-6">
          <h1 className="text-[22px] font-extrabold text-foreground tracking-tight m-0">
            Reset Password
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {error && (
          <div className="bg-destructive/12 border border-destructive/30 rounded-lg py-2 px-3 mb-4 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg border-none bg-primary text-primary-foreground text-sm font-bold cursor-pointer transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait"
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>

        <div className="text-center mt-4">
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
