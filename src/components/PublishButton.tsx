'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, ChevronDown, Trash2, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScheduleSummary {
  id: string;
  week_label: string;
  published_at: string;
}

interface PublishButtonProps {
  getHTML: () => string;
  disabled?: boolean;
  onSuccess?: (timestamp: string) => void;
  onDeleteSchedule?: () => Promise<void>;
  /** Data needed to save a schedule snapshot on publish */
  getSnapshotData?: () => {
    weekLabel: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    eventsSnapshot: unknown[];
    leagueOrder: string[];
    featuredLeagues: Record<string, string>;
  };
  onRestoreSchedule?: (scheduleId: string) => void;
  hasCurrentSelections?: boolean;
}

export default function PublishButton({ getHTML, disabled, onSuccess, onDeleteSchedule, getSnapshotData, onRestoreSchedule, hasCurrentSelections }: PublishButtonProps) {
  const [status, setStatus] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ScheduleSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen && !historyOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setDeleteConfirm(false);
      }
      if (historyOpen && historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
        setRestoreConfirm(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen, historyOpen]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/schedule-history');
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data.schedules ?? []);
      }
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  };

  const handlePush = async () => {
    if (disabled) return;
    const html = getHTML();
    if (!html) return;

    setStatus('pushing');
    setMessage('');

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const result = await res.json();
      setStatus('success');
      setMessage(`Published at ${result.updated}`);
      onSuccess?.(result.updated);

      // Save snapshot to Supabase (fire-and-forget)
      if (getSnapshotData) {
        const snapshot = getSnapshotData();
        fetch('/api/schedule-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...snapshot, htmlContent: html }),
        }).catch(() => {});
      }

      setTimeout(() => { setStatus('idle'); setMessage(''); }, 5000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Publish failed — check server logs');
    }
  };

  const handleDelete = async () => {
    if (!onDeleteSchedule) return;
    setIsDeleting(true);
    try {
      await onDeleteSchedule();
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(false);
      setDropdownOpen(false);
    }
  };

  const colorClass =
    status === 'success'
      ? 'bg-emerald-600 border-emerald-600 text-white'
      : status === 'error'
      ? 'bg-destructive border-destructive text-white'
      : disabled
      ? 'bg-secondary border-border text-muted-foreground'
      : 'bg-orange-600 border-orange-600 text-white';

  return (
    <div className="flex items-center gap-2">
      {/* History button — LEFT of Publish */}
      <div className="relative" ref={historyRef}>
        <button
          onClick={() => {
            setHistoryOpen((o) => !o);
            setRestoreConfirm(null);
            if (!historyOpen) fetchHistory();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground hover:bg-accent transition-colors"
          title="Past schedules"
        >
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">History</span>
        </button>

        {historyOpen && (
          <div className="absolute top-full left-0 mt-1.5 z-200 bg-popover border border-border rounded-lg shadow-2xl shadow-black/40 w-72 overflow-hidden animate-in fade-in-0 zoom-in-95">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Past Schedules</span>
            </div>
            {historyLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : historyItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No published schedules yet</p>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {historyItems.map((item) => (
                  <div key={item.id}>
                    {restoreConfirm === item.id ? (
                      <div className="p-3 space-y-2 bg-muted/50">
                        <p className="text-xs text-muted-foreground">
                          {hasCurrentSelections
                            ? 'Loading this schedule will replace your current selections. Continue?'
                            : 'Load this past schedule into preview?'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRestoreConfirm(null)}
                            className="flex-1 text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-accent transition-colors text-foreground"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              onRestoreSchedule?.(item.id);
                              setHistoryOpen(false);
                              setRestoreConfirm(null);
                            }}
                            className="flex-1 text-xs px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 transition-colors text-primary-foreground"
                          >
                            Load
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRestoreConfirm(item.id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm text-foreground">{item.week_label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(item.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative" ref={dropdownRef}>
        {/* Split button */}
        <div className={cn('flex rounded-md overflow-hidden border text-sm font-medium', colorClass)}>
          {/* Main publish action */}
          <button
            onClick={handlePush}
            disabled={disabled || status === 'pushing'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
              !disabled && status === 'idle' && 'hover:bg-orange-500',
              status === 'success' && 'hover:bg-emerald-500',
              status === 'error' && 'hover:bg-destructive/90',
              (disabled || status === 'pushing') && 'opacity-60 cursor-not-allowed'
            )}
          >
            {status === 'pushing' && <Loader2 className="w-4 h-4 animate-spin" />}
            {status === 'success' && <CheckCircle className="w-4 h-4" />}
            {status === 'error' && <AlertCircle className="w-4 h-4" />}
            {status === 'idle' && <Upload className="w-4 h-4" />}
            {status === 'pushing' ? 'Publishing…' : 'Publish'}
          </button>

          {/* Divider */}
          <div className="w-px bg-white/20 self-stretch" />

          {/* Dropdown trigger */}
          <button
            onClick={() => { setDropdownOpen((o) => !o); setDeleteConfirm(false); }}
            className="flex items-center px-2 py-1.5 hover:bg-white/10 transition-colors"
            aria-label="More publish options"
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-150', dropdownOpen && 'rotate-180')} />
          </button>
        </div>

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-1.5 z-200 bg-popover border border-border rounded-lg shadow-2xl shadow-black/40 min-w-55 overflow-hidden animate-in fade-in-0 zoom-in-95">
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                Delete current schedule
              </button>
            ) : (
              <div className="p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Delete the published schedule from WordPress?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="flex-1 text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-accent transition-colors text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 text-xs px-3 py-1.5 rounded-md bg-destructive hover:bg-destructive/80 transition-colors text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {message && (
        <span className={cn(
          'text-xs max-w-50 truncate',
          status === 'success' ? 'text-emerald-400' : 'text-destructive'
        )}>
          {message}
        </span>
      )}
    </div>
  );
}
