'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Login failed');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[380px] bg-card rounded-2xl p-[2.5rem_2rem] border border-border shadow-2xl shadow-black/20"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-[22px] font-extrabold text-foreground tracking-tight m-0">
            SCORE Admin
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            Sign in to manage schedules
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/12 border border-destructive/30 rounded-lg py-2 px-3 mb-4 text-[13px] text-destructive">
            {error}
          </div>
        )}

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
          placeholder="admin@example.com"
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
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm outline-none mb-6 placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg border-none bg-primary text-primary-foreground text-sm font-bold cursor-pointer transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
