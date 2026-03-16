'use client';

import { useState, useEffect } from 'react';
import { X, Wifi, WifiOff, Loader2, ShieldCheck, Server, Navigation, Globe, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTimezoneStore, formatTimezoneDisplay } from '@/lib/timezoneStore';
import { useThemeStore } from '@/lib/themeStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    configured?: boolean;
  } | null>(null);

  const { timezone, useLocal, setUseLocal } = useTimezoneStore();
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';
  const [detectedTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown');

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-connection');
      const result = await res.json();
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: `Network error: ${err instanceof Error ? err.message : 'Unknown'}`,
      });
    }
    setTesting(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-500 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Settings"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-border bg-background shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-background rounded-t-2xl shrink-0">
          <h2 className="text-lg font-bold text-foreground">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Appearance card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                Appearance
              </CardTitle>
              <CardDescription>
                Switch between light and dark modes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">Dark Mode</div>
                  <div className="text-xs text-muted-foreground">
                    {isDark ? 'Dark theme is active' : 'Light theme is active'}
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    isDark ? 'bg-primary' : 'bg-secondary border border-border'
                  )}
                  role="switch"
                  aria-checked={isDark}
                  aria-label="Toggle dark mode"
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                      isDark ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Timezone card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4" />
                Timezone
              </CardTitle>
              <CardDescription>
                All match times default to Phnom Penh (ICT, UTC+7). Toggle to use your local timezone instead.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Active timezone */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Active Timezone</label>
                <div className="mt-1 px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground flex items-center justify-between">
                  <span>{formatTimezoneDisplay(timezone)}</span>
                  <span className="text-xs text-muted-foreground">
                    {useLocal ? 'Your location' : 'Default (Phnom Penh)'}
                  </span>
                </div>
              </div>

              {/* Detected location */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/15">
                <Navigation
                  className="w-4 h-4 text-primary shrink-0"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">Detected Location</div>
                  <div className="text-xs text-muted-foreground truncate">{detectedTz ? formatTimezoneDisplay(detectedTz) : '—'}</div>
                </div>
              </div>

              {/* Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">Use my local time</div>
                  <div className="text-xs text-muted-foreground">
                    Switch all dates &amp; times to your browser timezone
                  </div>
                </div>
                <button
                  onClick={() => setUseLocal(!useLocal)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    useLocal ? 'bg-primary' : 'bg-secondary border border-border'
                  )}
                  role="switch"
                  aria-checked={useLocal}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                      useLocal ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* WordPress connection card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="w-4 h-4" />
                WordPress Connection
              </CardTitle>
              <CardDescription>
                Credentials are configured via server-side environment variables for security.
                They are never sent to or stored in the browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Security badge */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Credentials are stored server-side only — never exposed to the browser.
              </div>

              {/* Site URL */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Target Site</label>
                <div className="mt-1 px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground">
                  {process.env.NEXT_PUBLIC_WP_SITE_URL || 'https://scorekh.com'}
                </div>
              </div>

              {/* Test button */}
              <div className="flex items-center gap-3 pt-1">
                <Button variant="secondary" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  {testing ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>

              {/* Result */}
              {testResult && (
                <div
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-lg text-sm',
                    testResult.ok
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-destructive/10 border border-destructive/30 text-red-700 dark:text-red-300'
                  )}
                >
                  {testResult.ok ? (
                    <Wifi className="w-4 h-4 shrink-0" />
                  ) : (
                    <WifiOff className="w-4 h-4 shrink-0" />
                  )}
                  {testResult.message}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
