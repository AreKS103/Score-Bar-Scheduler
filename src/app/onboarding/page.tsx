'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check auth + whether user already has an org
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data, error: authErr }) => {
      if (authErr || !data.user) {
        router.push('/login');
        return;
      }

      // Pre-fill org name from email
      const prefix = (data.user.email ?? 'my').split('@')[0];
      setOrgName(prefix.charAt(0).toUpperCase() + prefix.slice(1) + "'s Organization");

      // Check if user already has orgs
      try {
        const res = await fetch('/api/org');
        if (res.ok) {
          const { organizations } = await res.json();
          if (organizations && organizations.length > 0) {
            router.push('/schedule');
            return;
          }
        }
      } catch {
        // Continue to show form
      }

      setLoading(false);
    });
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create organization');
      }

      router.push('/schedule');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#0a0a0a', color: '#999',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0a0a0a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 440, padding: '40px 32px',
        background: '#111', borderRadius: 16,
        border: '1px solid #222',
      }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Create your organization
        </h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 28, lineHeight: 1.5 }}>
          Your organization is where your schedules, embeds, and settings live.
          You can rename it later.
        </p>

        <form onSubmit={handleCreate}>
          <label style={{ display: 'block', color: '#aaa', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
            Organization name
          </label>
          <input
            type="text"
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            placeholder="e.g. My Sports Bar"
            maxLength={100}
            required
            autoFocus
            style={{
              width: '100%', padding: '10px 14px', fontSize: 15,
              background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
              color: '#fff', outline: 'none', boxSizing: 'border-box',
            }}
          />

          {error && (
            <p style={{ color: '#f44', fontSize: 13, marginTop: 8 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={creating || !orgName.trim()}
            style={{
              width: '100%', marginTop: 20, padding: '12px 0',
              background: creating ? '#333' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 15, fontWeight: 600, cursor: creating ? 'wait' : 'pointer',
              opacity: creating ? 0.7 : 1,
              transition: 'background 0.15s',
            }}
          >
            {creating ? 'Creating…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
