'use client';

import { useRef, useState, useEffect } from 'react';
import { LogOut, Moon, Sun, MoreHorizontal, Building2, Settings, Users } from 'lucide-react';
import { useThemeStore } from '@/lib/themeStore';
import { cn } from '@/lib/utils';

interface UserProfileMenuProps {
  email: string | null;
  username?: string | null;
  onLogout: () => void;
  onBusinessInfo: () => void;
  onSettings: () => void;
  onOrgManage?: () => void;
  businessLogoUrl?: string | null;
  orgName?: string | null;
  pendingInviteCount?: number;
}

function getInitials(email: string | null, username?: string | null): string {
  if (username) {
    const parts = username.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return username.slice(0, 2).toUpperCase();
  }
  if (!email) return '?';
  const parts = email.split('@')[0].split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export default function UserProfileMenu({ email, username, onLogout, onBusinessInfo, onSettings, onOrgManage, businessLogoUrl, orgName, pendingInviteCount }: UserProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = getInitials(email, username);

  return (
    <div ref={menuRef} className="relative">
      {/* ── Popover ──────────────────────────────────────────────────────────── */}
      {open && (
        <div className={cn(
          'absolute bottom-full left-0 right-0 mb-1.5 z-600',
          'bg-popover border border-border rounded-xl shadow-2xl shadow-black/30 overflow-hidden',
          'animate-in fade-in-0 slide-in-from-bottom-2 duration-150',
        )}>
          {/* User info header — clicking opens Settings */}
          <button
            onClick={() => { setOpen(false); onSettings(); }}
            className="w-full flex items-center gap-3 px-3 py-3 border-b border-border hover:bg-accent transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 select-none overflow-hidden">
              {businessLogoUrl
                ? <img src={businessLogoUrl} alt="" className="w-full h-full object-cover" />
                : initials
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate leading-normal">
                {username || email || 'Unknown user'}
              </p>
              <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                {username ? (email ?? 'Your Account') : (orgName ?? 'Your Account')}
              </p>
            </div>
          </button>

          {/* Theme toggle */}
          <div className="px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {isDark
                ? <Moon className="w-3.5 h-3.5 text-muted-foreground" />
                : <Sun className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className="text-xs text-foreground">
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </span>
            </div>
            <button
              onClick={toggleTheme}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                isDark ? 'bg-primary' : 'bg-secondary border border-border'
              )}
              role="switch"
              aria-checked={isDark}
              aria-label="Toggle dark mode"
            >
              <span className={cn(
                'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                isDark ? 'translate-x-4.5' : 'translate-x-0.5'
              )} />
            </button>
          </div>

          <div className="border-t border-border mx-2" />

          {/* Settings + Business Information */}
          <div className="px-1.5 pt-1.5 space-y-0.5">
            <button
              onClick={() => { setOpen(false); onSettings(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
            <button
              onClick={() => { setOpen(false); onBusinessInfo(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            >
              <Building2 className="w-3.5 h-3.5" />
              Business Information
            </button>

            {/* Organization quick-access row */}
            <button
              onClick={() => { setOpen(false); onOrgManage?.(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-accent transition-all group"
            >
              <Users className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
              <span className="flex-1 text-left text-muted-foreground group-hover:text-foreground">
                Organization
              </span>
              {!orgName && pendingInviteCount != null && pendingInviteCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                  {pendingInviteCount}
                </span>
              )}
              {orgName && (
                <span className="text-[11px] text-primary/80 font-semibold truncate max-w-27.5 leading-normal">
                  {orgName}
                </span>
              )}
            </button>
          </div>

          <div className="border-t border-border mx-2 mt-1.5" />

          {/* Sign out */}
          <div className="p-1.5">
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-accent transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* ── Trigger row — whole row opens the popover ───────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open user menu"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all overflow-hidden',
          'hover:bg-accent',
          open && 'bg-accent'
        )}
      >
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-bold shrink-0 select-none overflow-hidden">
          {businessLogoUrl
            ? <img src={businessLogoUrl} alt="" className="w-full h-full object-cover" />
            : initials
          }
        </div>

        {/* Email + Org */}
        <div className="flex-1 min-w-0 text-left overflow-hidden">
          <p className="text-xs text-muted-foreground truncate leading-normal">
            {username || email || '—'}
          </p>
          {orgName && (
            <p className="text-[10px] text-primary/70 font-medium truncate leading-normal">
              {orgName}
            </p>
          )}
        </div>

        {/* Three-dot icon (decorative — whole row is the click target) */}
        <MoreHorizontal className={cn('w-4 h-4 shrink-0 transition-colors', open ? 'text-foreground' : 'text-muted-foreground')} />
      </button>
    </div>
  );
}
