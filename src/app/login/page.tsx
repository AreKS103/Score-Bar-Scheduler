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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        padding: '1rem',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'oklch(0.178 0.005 285)',
          borderRadius: 16,
          padding: '2.5rem 2rem',
          border: '1px solid oklch(1 0 0 / 8%)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            SCORE Admin
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'oklch(0.65 0.01 260)',
              marginTop: 6,
            }}
          >
            Sign in to manage schedules
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: 'oklch(0.704 0.191 22.216 / 12%)',
              border: '1px solid oklch(0.704 0.191 22.216 / 30%)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: '1rem',
              fontSize: 13,
              color: 'oklch(0.85 0.15 22)',
            }}
          >
            {error}
          </div>
        )}

        {/* Email */}
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: 'oklch(0.7 0.01 260)',
            marginBottom: 6,
          }}
        >
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
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid oklch(1 0 0 / 12%)',
            background: 'oklch(0.145 0 0)',
            color: '#fff',
            fontSize: 14,
            outline: 'none',
            marginBottom: '1rem',
            boxSizing: 'border-box',
          }}
        />

        {/* Password */}
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: 'oklch(0.7 0.01 260)',
            marginBottom: 6,
          }}
        >
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid oklch(1 0 0 / 12%)',
            background: 'oklch(0.145 0 0)',
            color: '#fff',
            fontSize: 14,
            outline: 'none',
            marginBottom: '1.5rem',
            boxSizing: 'border-box',
          }}
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 8,
            border: 'none',
            background: loading
              ? 'oklch(0.45 0.15 259)'
              : 'oklch(0.623 0.214 259)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
