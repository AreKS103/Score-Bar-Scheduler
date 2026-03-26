'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Wifi, WifiOff, Loader2, ShieldCheck, Server, Navigation, Globe, Copy, CheckCircle, RefreshCw, EyeOff, User, Mail, Phone, KeyRound, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTimezoneStore, formatTimezoneDisplay } from '@/lib/timezoneStore';
import { createClient } from '@/lib/supabase/client';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { timezone, useLocal, setUseLocal, setTimezone } = useTimezoneStore();
  const [detectedTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown');
  const [tzSearch, setTzSearch] = useState('');
  const [tzOpen, setTzOpen] = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);

  // All IANA timezones, built once
  const allTimezones = useMemo<string[]>(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney'];
    }
  }, []);

  const filteredTz = useMemo(() => {
    const q = tzSearch.toLowerCase();
    return allTimezones.filter(tz =>
      tz.toLowerCase().includes(q) || tz.replace(/_/g, ' ').toLowerCase().includes(q)
    ).slice(0, 80);
  }, [allTimezones, tzSearch]);

  // Close timezone dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) {
        setTzOpen(false);
        setTzSearch('');
      }
    }
    if (tzOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tzOpen]);

  // API Key & User logic
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [connectedSite, setConnectedSite] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();

  // Account section state
  const [phone, setPhone] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameLoaded, setUsernameLoaded] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);

  // ── Organization state removed — managed by OrgModal ────────────────────

  // Handle modal close
  useEffect(() => {
    if (!isOpen) {
      setApiKey(null); // Hide API key when closed
      return;
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Fetch User ID + email + phone + verified status
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
      setUserEmail(data.user?.email || null);
      setPhone((data.user?.user_metadata?.phone as string) || data.user?.phone || '');
      setEmailVerified(!!data.user?.email_confirmed_at);
    });
  }, [supabase.auth]);

  // Load username from user_profiles
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/user-profile')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.username) setUsername(data.username);
        setUsernameLoaded(true);
      })
      .catch(() => setUsernameLoaded(true));
  }, [isOpen]);

  // Load Key preview from DB
  useEffect(() => {
    if (!userId) return;
    async function loadKey() {
      const { data } = await supabase
        .from('user_api_keys')
        .select('key_preview, connected_site')
        .eq('user_id', userId)
        .single();
      if (data) {
        setKeyPreview(data.key_preview);
        setConnectedSite(data.connected_site);
      }
      setLoadingKey(false);
    }
    loadKey();
  }, [userId, supabase]);

  const generateKey = async () => {
    if (!userId) return;
    
    // Confirm since it overwrites
    if (keyPreview && !confirm("Generating a new API Key will disconnect your existing WordPress widgets until you update them. Continue?")) {
      return;
    }

    setGenerating(true);
    
    try {
      const response = await fetch('/api/keys/generate', { method: 'POST' });
      if (!response.ok) throw new Error("Failed to generate key");
      
      const data = await response.json();
      
      if (data.apiKey) {
        setApiKey(data.apiKey);
        setKeyPreview(data.preview);
        // Persist in sessionStorage for live preview
        try { sessionStorage.setItem('sb-api-key', data.apiKey); } catch {}
        // Generation clears existing connected site since the key changes
        setConnectedSite(null);
      }
    } catch (err) {
      console.error(err);
      alert("Error generating API key");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const savePhone = async () => {
    setSavingPhone(true);
    const { error } = await supabase.auth.updateUser({ data: { phone: phone.trim() } });
    setSavingPhone(false);
    if (!error) {
      setPhoneSaved(true);
      setTimeout(() => setPhoneSaved(false), 2000);
    }
  };

  const saveUsername = async () => {
    setSavingUsername(true);
    try {
      const res = await fetch('/api/user-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (res.ok) {
        setUsernameSaved(true);
        setTimeout(() => setUsernameSaved(false), 2000);
      }
    } catch { /* ignore */ }
    setSavingUsername(false);
  };

  const sendPasswordReset = async () => {
    if (!userEmail) return;
    setSendingReset(true);
    await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/auth/confirm?type=recovery`,
    });
    setSendingReset(false);
    setResetSent(true);
    setTimeout(() => setResetSent(false), 4000);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
      alert('Account deletion failed. Please contact support.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Settings"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-border bg-background shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95">
        
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-background rounded-t-2xl shrink-0">
          <h2 className="text-lg font-bold text-foreground">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Account ──────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="w-4 h-4" /> Account
              </CardTitle>
              <CardDescription>Manage your profile, password and account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Email (read-only) */}
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                  <Mail className="w-3.5 h-3.5" /> Email Address
                </label>
                <div className="px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground select-all flex items-center gap-2">
                  <span className="flex-1">{userEmail ?? '—'}</span>
                  {emailVerified && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-full shrink-0">
                      <CheckCircle className="w-3 h-3" />
                      Verified
                    </span>
                  )}
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                  <User className="w-3.5 h-3.5" /> Username
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={userEmail ?? 'Enter a display name'}
                    maxLength={50}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-md text-sm border border-border bg-secondary/40',
                      'text-foreground placeholder:text-muted-foreground/50',
                      'focus:outline-none focus:ring-2 focus:ring-ring transition',
                    )}
                  />
                  <Button variant="outline" size="sm" onClick={saveUsername} disabled={savingUsername} className="shrink-0">
                    {savingUsername
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : usernameSaved
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        : 'Save'
                    }
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Shown in publish history and across the app. Leave empty to use your email.
                </p>
              </div>

              {/* Phone */}
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                  <Phone className="w-3.5 h-3.5" /> Phone Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                    className={cn(
                      'flex-1 px-3 py-2 rounded-md text-sm border border-border bg-secondary/40',
                      'text-foreground placeholder:text-muted-foreground/50',
                      'focus:outline-none focus:ring-2 focus:ring-ring transition',
                    )}
                  />
                  <Button variant="outline" size="sm" onClick={savePhone} disabled={savingPhone} className="shrink-0">
                    {savingPhone
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : phoneSaved
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        : 'Save'
                    }
                  </Button>
                </div>
              </div>

              {/* Reset password */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                <div>
                  <div className="text-sm font-medium text-foreground">Password</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Send a reset link to your email</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendPasswordReset}
                  disabled={sendingReset || resetSent}
                  className="shrink-0"
                >
                  {sendingReset
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : resetSent
                      ? <><CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> Sent</>
                      : <><KeyRound className="w-3.5 h-3.5 mr-1.5" /> Reset Password</>
                  }
                </Button>
              </div>


            </CardContent>
          </Card>

          {/* ── Timezone ─────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4" /> Timezone
              </CardTitle>
              <CardDescription>Match times are displayed in your chosen timezone and remembered for next time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Active timezone display */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Active Timezone</label>
                <div className="mt-1 px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground flex items-center justify-between">
                  <span className="font-medium">{formatTimezoneDisplay(timezone)}</span>
                  <span className="text-xs text-muted-foreground font-mono">{timezone}</span>
                </div>
              </div>

              {/* Auto-detect toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/15">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Navigation className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">Use my location</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {useLocal ? `Auto: ${formatTimezoneDisplay(detectedTz)}` : 'Auto-detect disabled — using custom timezone'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setUseLocal(!useLocal)}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ml-3',
                    useLocal ? 'bg-primary' : 'bg-secondary border border-border'
                  )}
                  role="switch"
                  aria-checked={useLocal}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    useLocal ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>

              {/* Manual timezone picker — shown when auto-detect is off */}
              {!useLocal && (
                <div ref={tzRef} className="relative">
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Choose Timezone</label>
                  <button
                    type="button"
                    onClick={() => { setTzOpen(v => !v); setTzSearch(''); }}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm bg-secondary/40 text-foreground transition',
                      tzOpen ? 'border-ring ring-2 ring-ring/30' : 'border-border hover:border-ring/50'
                    )}
                  >
                    <span>{formatTimezoneDisplay(timezone)} <span className="text-muted-foreground font-mono text-xs ml-1">{timezone}</span></span>
                    <svg className={cn('w-4 h-4 text-muted-foreground transition-transform', tzOpen && 'rotate-180')} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {tzOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95 overflow-hidden">
                      {/* Search input */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search timezone…"
                          value={tzSearch}
                          onChange={e => setTzSearch(e.target.value)}
                          className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground/60"
                        />
                        {tzSearch && (
                          <button onClick={() => setTzSearch('')} className="text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Results list */}
                      <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
                        {/* Browser detected TZ always at top */}
                        {!tzSearch && (
                          <li>
                            <button
                              type="button"
                              role="option"
                              aria-selected={timezone === detectedTz}
                              onClick={() => { setTimezone(detectedTz); setTzOpen(false); setTzSearch(''); }}
                              className={cn(
                                'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors',
                                timezone === detectedTz && 'bg-primary/10 text-primary'
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <Navigation className="w-3 h-3 text-primary shrink-0" />
                                {formatTimezoneDisplay(detectedTz)}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">{detectedTz}</span>
                            </button>
                          </li>
                        )}
                        {filteredTz.length === 0 ? (
                          <li className="px-3 py-4 text-sm text-muted-foreground text-center">No timezones found</li>
                        ) : (
                          filteredTz.map(tz => (
                            <li key={tz}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={timezone === tz}
                                onClick={() => { setTimezone(tz); setTzOpen(false); setTzSearch(''); }}
                                className={cn(
                                  'w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent transition-colors',
                                  timezone === tz && 'bg-primary/10 text-primary'
                                )}
                              >
                                <span>{formatTimezoneDisplay(tz)}</span>
                                <span className="text-xs text-muted-foreground font-mono">{tz}</span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="w-4 h-4" /> WordPress Integration
              </CardTitle>
              <CardDescription>
                Connect your account to your WordPress site via our white-label plugin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!keyPreview ? (
                <Button onClick={generateKey} disabled={generating} className="w-full sm:w-auto">
                  {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Generate API Key
                </Button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">Your API Key</label>
                    <div className="flex flex-col gap-2">
                       {/* If apiKey is null we show the preview stored in DB (raw key not available) */}
                       {apiKey ? (
                         <>
                          <code className="w-full bg-secondary px-3 py-2 rounded-md font-mono text-xs border border-border select-all break-all text-foreground font-semibold">
                            {apiKey}
                          </code>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={copyToClipboard} className="flex-1">
                              {copied ? <CheckCircle className="w-4 h-4 mr-2 text-emerald-500" /> : <Copy className="w-4 h-4 mr-2" />}
                              {copied ? 'Copied' : 'Copy'}
                            </Button>
                            <Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={generateKey} disabled={generating}>
                              <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                              Revoke
                            </Button>
                          </div>
                         </>
                       ) : (
                         <>
                          <div className="w-full flex items-center justify-between bg-secondary px-3 py-2 rounded-md font-mono text-xs border border-border text-muted-foreground min-w-0">
                            <span className="truncate mr-3">{keyPreview}</span>
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider bg-background/50 px-2 py-0.5 rounded shrink-0">
                              <EyeOff className="w-3 h-3" /> Hidden
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={generateKey} disabled={generating}>
                              <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                              Revoke &amp; Regenerate
                            </Button>
                          </div>
                         </>
                       )}
                    </div>
                    {apiKey ? (
                      <p className="text-xs text-destructive font-medium mt-2">
                        Make sure to copy your API key now. You won't be able to see it again!
                      </p>
                    ) : (
                       <p className="text-xs text-muted-foreground mt-2">
                        For your security, we only show your API key once. If you lost it, generate a new one.
                      </p>
                    )}
                  </div>

                  <div className="bg-secondary/30 rounded-lg p-3 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-sm">Connection Status</h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[250px] truncate">
                        {connectedSite ? (
                          <>Connected to: <a href={connectedSite} target="_blank" rel="noreferrer" className="text-primary hover:underline">{connectedSite}</a></>
                        ) : (
                          'Not connected yet. Paste your key in your WordPress plugin to establish a connection.'
                        )}
                      </p>
                    </div>
                    <div>
                      {connectedSite ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block animate-pulse"></span>
                          Connected
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-full border border-border block">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}


            </CardContent>
          </Card>

          {/* ── Delete Account (Vercel-style) ─────────────────────────────── */}
          <div className="rounded-xl border border-destructive/40 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">Delete Account</h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Permanently remove your account and all of its contents. This action is not reversible, so please continue with caution.
              </p>
            </div>
            {/* Footer strip */}
            <div className={cn(
              'px-5 py-3 flex items-center justify-end gap-3',
              'bg-destructive/8 border-t border-destructive/30',
            )}>
              {deleteConfirm ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={deleteAccount}
                    disabled={deleting}
                    className="bg-destructive hover:bg-destructive/90 !text-white"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Delete'}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setDeleteConfirm(true)}
                  className="bg-destructive hover:bg-destructive/90 !text-white"
                >
                  Delete Account
                </Button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
