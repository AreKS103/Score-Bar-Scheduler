'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download, CheckCircle, Circle, Loader2, ExternalLink,
  ChevronRight, ChevronDown, KeyRound, AlertCircle, ArrowRight,
  Plug, Shield, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/* ─── Local-storage keys ────────────────────────────────────────────────── */
const LS_STEP = 'wp_connect_step';
const LS_SITE_URL = 'wp_site_url';
const LS_DOWNLOADED = 'wp_plugin_downloaded';
const LS_INSTALLED = 'wp_plugin_installed';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface ConnectedState {
  siteUrl: string;
  connectedAt: string;
}

interface WPConnectWizardProps {
  /** If the user already has a connection, show connected UI */
  existingConnection?: ConnectedState | null;
  /** Called after successful connection */
  onConnected?: () => void;
  /** Called when the user dismisses the wizard (e.g. "Skip for now") */
  onClose?: () => void;
}

/* ─── Step indicator ────────────────────────────────────────────────────── */
function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: 'Download' },
    { num: 2, label: 'Install' },
    { num: 3, label: 'Connect' },
  ];
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((s, i) => {
        const done = currentStep > s.num;
        const active = currentStep === s.num;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                  done && 'bg-emerald-500 text-white',
                  active && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                  !done && !active && 'bg-secondary text-muted-foreground border border-border',
                )}
              >
                {done ? <CheckCircle className="w-5 h-5" /> : s.num}
              </div>
              <span
                className={cn(
                  'text-xs mt-1.5 font-medium',
                  done && 'text-emerald-500',
                  active && 'text-foreground',
                  !done && !active && 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'w-16 sm:w-24 h-0.5 mx-2 mb-5 rounded-full transition-colors',
                  currentStep > s.num + 1
                    ? 'bg-emerald-500'
                    : currentStep > s.num
                      ? 'bg-primary/50'
                      : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Step 1: Download Plugin ───────────────────────────────────────────── */
function StepDownload({
  onComplete,
  completed,
}: {
  onComplete: () => void;
  completed: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [pluginVersion, setPluginVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/plugin/update')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.version) setPluginVersion(data.version);
      })
      .catch(() => {});
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/plugin/download');
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scorebar-scheduler.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onComplete();
    } catch {
      alert('Failed to download the plugin. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="w-4 h-4" />
          Download Plugin
        </CardTitle>
        <CardDescription>
          First, download the Score Scheduler plugin for WordPress.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={handleDownload}
          disabled={downloading}
          className={cn(
            'w-full sm:w-auto',
            completed && 'bg-emerald-600 hover:bg-emerald-700',
          )}
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : completed ? (
            <CheckCircle className="w-4 h-4 mr-2" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {completed
            ? 'Downloaded — Download Again'
            : `Download Plugin${pluginVersion ? ` (v${pluginVersion})` : ''}`}
        </Button>

        {completed && (
          <p className="text-xs text-emerald-500 mt-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Plugin downloaded. Continue to Step 2.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Step 2: Install Plugin ────────────────────────────────────────────── */
function StepInstall({
  onComplete,
  completed,
}: {
  onComplete: () => void;
  completed: boolean;
}) {
  const [checked, setChecked] = useState(completed);

  const handleCheck = (val: boolean) => {
    setChecked(val);
    if (val) onComplete();
  };

  const instructions = [
    'Go to your WordPress admin dashboard',
    'Navigate to Plugins → Add New → Upload Plugin',
    'Choose the scorebar-scheduler.zip file you just downloaded',
    'Click Install Now, then Activate',
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="w-4 h-4" />
          Install &amp; Activate
        </CardTitle>
        <CardDescription>
          Install the plugin on your WordPress site.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {instructions.map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-foreground">{text}</span>
            </li>
          ))}
        </ol>

        <label className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 border border-border cursor-pointer hover:bg-secondary/60 transition-colors">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => handleCheck(e.target.checked)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary"
          />
          <span className="text-sm font-medium text-foreground">
            I have installed and activated the plugin
          </span>
        </label>

        {completed && (
          <p className="text-xs text-emerald-500 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Plugin installed. Continue to Step 3.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Step 3: Connect ───────────────────────────────────────────────────── */
function StepConnect({
  onConnected,
}: {
  onConnected: (siteUrl: string) => void;
}) {
  const [siteUrl, setSiteUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Restore saved URL
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_SITE_URL);
      if (saved) setSiteUrl(saved);
    } catch {}
  }, []);

  const validateUrl = (url: string): string | null => {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) return 'Please enter your WordPress site URL.';
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
      return 'URL must start with https:// (or http:// for local dev).';
    }
    try {
      new URL(trimmed);
    } catch {
      return 'Please enter a valid URL.';
    }
    return null;
  };

  const handleConnect = async () => {
    const trimmed = siteUrl.trim().replace(/\/+$/, '');
    const urlError = validateUrl(trimmed);
    if (urlError) {
      setError(urlError);
      return;
    }

    setError(null);
    setConnecting(true);

    try {
      // Save the URL in localStorage for persistence
      localStorage.setItem(LS_SITE_URL, trimmed);

      const res = await fetch('/api/wp-connect/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to initiate connection.');
      }

      const data = await res.json();

      if (data.redirectUrl) {
        // Redirect to WordPress auth page
        window.location.href = data.redirectUrl;
      } else {
        // Direct connection (API key flow)
        onConnected(trimmed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed. Please try again.');
      setConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="w-4 h-4" />
          Authorize Connection
        </CardTitle>
        <CardDescription>
          Enter your WordPress site URL and click connect. You&apos;ll be redirected to authorize.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Checklist */}
        <div className="space-y-2 p-3 rounded-lg bg-secondary/30 border border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Make sure you have completed:
          </p>
          <div className="flex items-center gap-2 text-sm text-emerald-500">
            <CheckCircle className="w-4 h-4" />
            <span>Step 1: Plugin downloaded</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-emerald-500">
            <CheckCircle className="w-4 h-4" />
            <span>Step 2: Plugin installed and activated on your site</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Circle className="w-4 h-4 text-muted-foreground" />
            <span>Step 3: Click below to connect</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
            WordPress Site URL
          </label>
          <Input
            type="url"
            placeholder="https://yoursite.com"
            value={siteUrl}
            onChange={e => {
              setSiteUrl(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') handleConnect();
            }}
            aria-invalid={!!error}
          />
          {error && (
            <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>

        <Button
          onClick={handleConnect}
          disabled={connecting || !siteUrl.trim()}
          className="w-full"
        >
          {connecting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4 mr-2" />
          )}
          {connecting ? 'Connecting…' : 'Connect WordPress Site'}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─── Already set up (condensed summary) state ──────────────────────────── */
function AlreadySetUpState({
  siteUrl,
  connectedAt,
  onReconfigure,
}: {
  siteUrl: string;
  connectedAt: string;
  onReconfigure: () => void;
}) {
  const router = useRouter();
  const hostname = (() => {
    try {
      return new URL(siteUrl).hostname;
    } catch {
      return siteUrl;
    }
  })();

  const formattedDate = (() => {
    try {
      return new Date(connectedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return connectedAt;
    }
  })();

  const steps = [
    { label: 'Download Plugin', detail: 'Plugin downloaded' },
    { label: 'Install & Activate', detail: 'Plugin installed on WordPress' },
  ];

  return (
    <div className="space-y-4">
      {/* Condensed step summary */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">{s.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{s.detail}</span>
                </div>
              </div>
            ))}

            {/* Step 3 — Authorize Connection: shows Connected status */}
            <div className="flex items-center gap-3 py-1">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">Authorize Connection</span>
                <span className="text-xs text-muted-foreground ml-2 truncate">
                  <a
                    href={siteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {hostname}
                  </a>
                </span>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block animate-pulse" />
                Connected
              </span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
            Connected {formattedDate}
          </p>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => router.push('/schedule')}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          Go to Schedule
        </button>
        <span className="text-muted-foreground">·</span>
        <a
          href={`${siteUrl}/wp-admin/`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          WordPress Admin
        </a>
        <span className="text-muted-foreground">·</span>
        <button
          onClick={onReconfigure}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Reconfigure
        </button>
      </div>
    </div>
  );
}

/* ─── Manual API Key fallback ───────────────────────────────────────────── */
function ManualKeyFallback() {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/keys/status')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.keyPreview) setKeyPreview(data.keyPreview);
      })
      .catch(() => {});
  }, []);

  const generateKey = async () => {
    if (
      keyPreview &&
      !confirm(
        'Generating a new API Key will disconnect your existing WordPress widgets until you update them. Continue?',
      )
    ) {
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/keys/generate', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (data.apiKey) {
        setApiKey(data.apiKey);
        setKeyPreview(data.preview);
      }
    } catch {
      alert('Error generating API key');
    } finally {
      setGenerating(false);
    }
  };

  const copyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <KeyRound className="w-3 h-3" />
        Connect manually with API key
      </button>

      {expanded && (
        <Card className="mt-3">
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Generate a key here and paste it in your WordPress plugin settings.
            </p>

            {apiKey ? (
              <div className="space-y-2">
                <code className="block w-full bg-secondary px-3 py-2 rounded-md font-mono text-xs border border-border select-all break-all text-foreground font-semibold">
                  {apiKey}
                </code>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyKey}>
                    {copied ? (
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                    ) : null}
                    {copied ? 'Copied' : 'Copy Key'}
                  </Button>
                </div>
                <p className="text-xs text-destructive font-medium">
                  Copy your API key now — you won&apos;t be able to see it again.
                </p>
              </div>
            ) : keyPreview ? (
              <div className="space-y-2">
                <div className="px-3 py-2 rounded-md font-mono text-xs border border-border bg-secondary/50 text-muted-foreground">
                  {keyPreview}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateKey}
                  disabled={generating}
                >
                  {generating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Revoke &amp; Regenerate
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={generateKey}
                disabled={generating}
              >
                {generating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Generate API Key
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══ Main Wizard Component ═════════════════════════════════════════════ */
export default function WPConnectWizard({
  existingConnection,
  onConnected,
  onClose,
}: WPConnectWizardProps) {
  const [step, setStep] = useState(1);
  const [downloaded, setDownloaded] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [reconfiguring, setReconfiguring] = useState(false);
  const [connected, setConnected] = useState<ConnectedState | null>(
    existingConnection ?? null,
  );

  // Restore progress from localStorage
  useEffect(() => {
    try {
      const savedStep = localStorage.getItem(LS_STEP);
      const savedDownloaded = localStorage.getItem(LS_DOWNLOADED);
      const savedInstalled = localStorage.getItem(LS_INSTALLED);

      if (savedDownloaded === 'true') setDownloaded(true);
      if (savedInstalled === 'true') setInstalled(true);
      if (savedStep) {
        const n = parseInt(savedStep, 10);
        if (n >= 1 && n <= 3) setStep(n);
      }
    } catch {}
  }, []);

  // Persist progress
  const persistProgress = useCallback(
    (s: number, dl: boolean, inst: boolean) => {
      try {
        localStorage.setItem(LS_STEP, String(s));
        localStorage.setItem(LS_DOWNLOADED, String(dl));
        localStorage.setItem(LS_INSTALLED, String(inst));
      } catch {}
    },
    [],
  );

  const completeDownload = () => {
    setDownloaded(true);
    setStep(2);
    persistProgress(2, true, installed);
  };

  const completeInstall = () => {
    setInstalled(true);
    setStep(3);
    persistProgress(3, true, true);
  };

  const completeConnect = (siteUrl: string) => {
    const now = new Date().toISOString();
    setConnected({ siteUrl, connectedAt: now });
    setReconfiguring(false);
    // Clean up progress
    try {
      localStorage.removeItem(LS_STEP);
      localStorage.removeItem(LS_SITE_URL);
      localStorage.removeItem(LS_DOWNLOADED);
      localStorage.removeItem(LS_INSTALLED);
    } catch {}
    onConnected?.();
  };

  // Already connected — show condensed "already set up" summary
  if (connected && !reconfiguring) {
    return (
      <div>
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-foreground">
            WordPress Site Connected
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your WordPress site is set up and ready.
          </p>
        </div>
        <AlreadySetUpState
          siteUrl={connected.siteUrl}
          connectedAt={connected.connectedAt}
          onReconfigure={() => {
            setReconfiguring(true);
            setStep(1);
            setDownloaded(false);
            setInstalled(false);
          }}
        />
        <ManualKeyFallback />
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-foreground">
          Connect Your WordPress Site
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Follow these steps to connect your WordPress site with Score Scheduler.
        </p>
        {reconfiguring && connected && (
          <button
            onClick={() => setReconfiguring(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 underline underline-offset-2"
          >
            ← Back to summary
          </button>
        )}
      </div>

      <StepIndicator currentStep={step} />

      <div className="space-y-4">
        {/* Step 1 — always visible */}
        <div
          className={cn(
            'transition-opacity',
            step < 1 && 'opacity-50 pointer-events-none',
          )}
        >
          <StepDownload
            onComplete={completeDownload}
            completed={downloaded}
          />
        </div>

        {/* Step 2 — visible once Step 1 is done */}
        {step >= 2 && (
          <div
            className={cn(
              'transition-opacity animate-in fade-in-0 slide-in-from-bottom-2',
              step < 2 && 'opacity-50 pointer-events-none',
            )}
          >
            <StepInstall
              onComplete={completeInstall}
              completed={installed}
            />
          </div>
        )}

        {/* Step 3 — visible once Step 2 is done */}
        {step >= 3 && (
          <div className="animate-in fade-in-0 slide-in-from-bottom-2">
            <StepConnect onConnected={completeConnect} />
          </div>
        )}
      </div>

      {/* Manual fallback always available */}
      <ManualKeyFallback />

      {/* Skip link for users who want to go straight to schedule */}
      <div className="text-center mt-6">
        {onClose ? (
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        ) : (
          <a
            href="/schedule"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </a>
        )}
      </div>
    </div>
  );
}
