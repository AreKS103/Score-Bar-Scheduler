'use client';

/**
 * Dedicated invite-token processor.
 *
 * Flow:
 *  1. Supabase invite email → user clicks link → lands on /login#access_token=…&type=invite
 *  2. Login page detects hash, immediately does window.location.replace('/auth/invite' + hash)
 *  3. THIS PAGE reads the hash, calls setSession() to establish the session cookie
 *  4. Redirects to /welcome (password-setup page)
 *
 * Why a dedicated page:
 *  – Single responsibility, no mixed logic with the sign-in form
 *  – Full error visibility in the UI (not just silent console failures)
 *  – Easy to diagnose: all state is on this page, nowhere else
 *
 * DEBUG: Open browser DevTools → Console to see all [invite] log lines.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Stage =
  | 'parsing'       // reading URL tokens
  | 'exchanging'    // calling setSession / exchangeCodeForSession
  | 'redirecting'   // navigating to /welcome
  | 'error';        // something failed

interface ErrorInfo {
  title: string;
  detail: string;
  /** Debug-only: raw values from the URL / Supabase */
  debugLines: string[];
}

function getAuthErrorStatus(error: unknown) {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 'n/a';
  const status = (error as { status?: unknown }).status;
  return typeof status === 'string' || typeof status === 'number' ? status : 'n/a';
}

export default function InvitePage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('parsing');
  const [errInfo, setErrInfo] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    const showError = (info: ErrorInfo) => {
      queueMicrotask(() => {
        setStage('error');
        setErrInfo(info);
      });
    };

    const showExchanging = () => {
      queueMicrotask(() => setStage('exchanging'));
    };

    if (!isSupabaseConfigured()) {
      showError({
        title: 'App not configured',
        detail: 'Supabase environment variables are missing.',
        debugLines: ['NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set'],
      });
      return;
    }

    const hash = window.location.hash;   // e.g. #access_token=…&type=invite
    const search = window.location.search; // e.g. ?code=… (PKCE)

    // ── Diagnostic log (always visible in DevTools) ────────────────
    console.log('[invite] page loaded');
    console.log('[invite] hash   :', hash.length ? hash.substring(0, 80) + '…' : '(empty)');
    console.log('[invite] search :', search || '(empty)');

    // ── 1. Error already encoded in hash (e.g. expired link) ────────
    if (hash.includes('error=') || hash.includes('error_description=')) {
      const p = new URLSearchParams(hash.substring(1));
      const msg = decodeURIComponent(
        p.get('error_description') || p.get('error') || 'Unknown error'
      );
      console.error('[invite] hash contains error:', msg);
      showError({
        title: 'Invite link error',
        detail: msg,
        debugLines: [`error param: ${msg}`],
      });
      return;
    }

    const hashParams = new URLSearchParams(hash.substring(1));
    const hashType = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    console.log('[invite] hash type        :', hashType ?? '(none)');
    console.log('[invite] access_token     :', accessToken ? accessToken.substring(0, 20) + '…' : '(none)');
    console.log('[invite] refresh_token    :', refreshToken ? refreshToken.substring(0, 8) + '…' : '(none)');

    // ── 2. Implicit-flow hash tokens (#access_token=…&type=invite) ──
    if (accessToken && refreshToken) {
      window.history.replaceState(null, '', window.location.pathname);
      showExchanging();

      const supabase = createClient();
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          console.log('[invite] setSession → session:', !!data.session, '| error:', error?.message ?? 'none');

          if (data.session) {
            console.log('[invite] session established for user:', data.session.user?.email);
            setStage('redirecting');
            router.replace('/welcome');
          } else {
            setStage('error');
            setErrInfo({
              title: 'Failed to activate invite',
              detail: error?.message ?? 'setSession returned no session. The link may be expired.',
              debugLines: [
                `error: ${error?.message ?? 'none'}`,
                `error status: ${getAuthErrorStatus(error)}`,
                `token prefix: ${accessToken.substring(0, 20)}`,
              ],
            });
          }
        });

      return;
    }

    // ── 3. PKCE code exchange (?code=…) ─────────────────────────────
    const code = new URLSearchParams(search).get('code');
    console.log('[invite] PKCE code present:', !!code);

    if (code) {
      window.history.replaceState(null, '', window.location.pathname);
      showExchanging();

      const supabase = createClient();
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ data, error }) => {
          console.log('[invite] exchangeCode → session:', !!data.session, '| error:', error?.message ?? 'none');

          if (data.session) {
            console.log('[invite] session established for user:', data.session.user?.email);
            setStage('redirecting');
            router.replace('/welcome');
          } else {
            setStage('error');
            setErrInfo({
              title: 'Failed to activate invite',
              detail: error?.message ?? 'Code exchange returned no session.',
              debugLines: [
                `error: ${error?.message ?? 'none'}`,
                `code prefix: ${code.substring(0, 12)}`,
              ],
            });
          }
        });

      return;
    }

    // ── 4. Nothing usable in the URL ────────────────────────────────
    console.warn('[invite] no tokens found. hash:', hash, '| search:', search);
    showError({
      title: 'No invite tokens found',
      detail:
        'This page did not receive any invite credentials. The link may have already been used or is malformed.',
      debugLines: [
        `hash: ${hash.substring(0, 80) || '(empty)'}`,
        `search: ${search || '(empty)'}`,
      ],
    });
  }, [router]);

  // ── UI ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 text-center">

        {(stage === 'parsing' || stage === 'exchanging' || stage === 'redirecting') && (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground leading-normal">
              {stage === 'parsing' && 'Checking invite link…'}
              {stage === 'exchanging' && 'Activating your account…'}
              {stage === 'redirecting' && 'Redirecting…'}
            </p>
          </div>
        )}

        {stage === 'error' && errInfo && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 space-y-3 text-left">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <h2 className="text-sm font-semibold text-foreground leading-normal">{errInfo.title}</h2>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">{errInfo.detail}</p>

            {/* Debug info (always shown when there's an error so user can screenshot) */}
            <div className="rounded-lg bg-black/20 p-3 space-y-1">
              {errInfo.debugLines.map((line, i) => (
                <p key={i} className="text-[10px] font-mono text-muted-foreground/70 break-all leading-normal">
                  {line}
                </p>
              ))}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <p className="text-xs text-muted-foreground leading-normal">
                Ask your admin to resend the invite, or try again.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => window.history.back()}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Go back
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => router.replace('/login')}
                >
                  Sign in
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
