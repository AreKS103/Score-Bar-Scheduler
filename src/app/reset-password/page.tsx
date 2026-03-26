'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) { router.replace('/login'); return; }
    const supabase = createClient();

    const hash = window.location.hash;
    const hasRecoveryHash = hash.includes('type=recovery');

    if (hasRecoveryHash) {
      // Supabase client auto-processes the recovery hash fragment.
      // Listen for PASSWORD_RECOVERY or SIGNED_IN to confirm session is ready.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session?.user) {
          setUserEmail(session.user.email ?? null);
          setChecking(false);
          subscription.unsubscribe();
          window.history.replaceState(null, '', window.location.pathname);
        }
      });
      return () => subscription.unsubscribe();
    }

    // No recovery hash — check for existing session (redirected from /login)
    supabase.auth.getUser().then(({ data, error: authErr }) => {
      if (authErr || !data.user) {
        router.replace('/login');
        return;
      }
      setUserEmail(data.user.email ?? null);
      setChecking(false);
    });
  }, [router]);

  const valid = password.length >= 8 && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => router.push('/schedule'), 1500);
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-foreground leading-normal">Reset your password</h1>
          <p className="text-sm text-muted-foreground leading-normal">
            Enter a new password for{' '}
            <span className="font-semibold text-foreground">{userEmail}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground leading-normal">New password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoFocus
                minLength={8}
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm border border-border bg-secondary/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring transition"
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
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground leading-normal">Confirm new password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              className={`w-full px-3 py-2.5 rounded-lg text-sm border bg-secondary/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring transition ${confirm && confirm !== password ? 'border-destructive/60' : 'border-border'}`}
            />
            {confirm && confirm !== password && (
              <p className="text-xs text-destructive leading-normal">Passwords don&apos;t match</p>
            )}
          </div>

          {error && <p className="text-xs text-destructive leading-normal">{error}</p>}

          <button
            type="submit"
            disabled={!valid || saving || done}
            className="w-full py-2.5 rounded-lg border-none bg-primary text-primary-foreground text-sm font-bold cursor-pointer transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait"
          >
            {saving ? 'Saving…' : done ? '✓ Redirecting…' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
