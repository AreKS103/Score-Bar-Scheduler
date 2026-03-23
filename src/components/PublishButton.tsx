'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, ChevronDown, Trash2, History, X, Clock, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTimezoneStore } from '@/lib/timezoneStore';

interface ScheduleSummary {
  id: string;
  week_label: string;
  published_at: string;
  embed_target: string | null;
}

interface PendingSchedule {
  id: string;
  scheduled_at: string;
  week_label: string;
  status: string;
}

const HISTORY_CACHE_MS = 60_000;

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
  onRestoreSchedule?: (scheduleId: string, embedTarget?: string | null) => void;
  hasCurrentSelections?: boolean;
  /** Embed instances + publish target — lifted from parent */
  embedInstances?: { display_id: string; embed_id: string | null }[];
  publishTarget?: string;
}

export default function PublishButton({ getHTML, disabled, onSuccess, onDeleteSchedule, getSnapshotData, onRestoreSchedule, hasCurrentSelections, embedInstances: externalEmbedInstances, publishTarget: externalPublishTarget }: PublishButtonProps) {
  const selectedTimezone = useTimezoneStore((state) => state.timezone);
  const [status, setStatus] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ScheduleSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);
  // 5-second publish countdown (null = not counting, 0 = fire, 1-5 = counting)
  const [countdown, setCountdown] = useState<number | null>(null);
  // Undo toast state
  const [undoToast, setUndoToast] = useState<{ prevSchedule: any } | null>(null);
  // Scheduled publish state
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledInfo, setScheduledInfo] = useState<{ date: string; time: string } | null>(null);
  // Pending scheduled publishes
  const [pendingSchedules, setPendingSchedules] = useState<PendingSchedule[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Embed instances + publish target — driven by parent (PreviewPanel selector)
  const embedInstances = externalEmbedInstances ?? [];
  const publishTarget = externalPublishTarget ?? '';

  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  // Stores previous schedule object fetched just before publish starts (for undo)
  const prevScheduleRef = useRef<any>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyFetchedAtRef = useRef(0);
  const historyAbortRef = useRef<AbortController | null>(null);
  // Ref to publish function so the countdown effect always calls the freshest closure
  const doPublishRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const scheduleModeRef = useRef(false);
  scheduleModeRef.current = scheduleMode;

  // Close dropdowns on outside click
  useEffect(() => {
    if (!dropdownOpen && !historyOpen) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(target)) {
        // When in schedule mode, don't close on any outside click (calendar popover portals outside)
        if (scheduleModeRef.current) {
          const closest = (target as Element).closest?.('[data-radix-popper-content-wrapper], [data-slot="popover-content"]');
          if (closest) return;
          return;
        }
        setDropdownOpen(false);
        setDeleteConfirm(false);
        setScheduleMode(false);
      }
      if (historyOpen && historyRef.current && !historyRef.current.contains(target)) {
        setHistoryOpen(false);
        setRestoreConfirm(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen, historyOpen]);

  // Countdown tick — calls doPublishRef.current when it reaches 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      doPublishRef.current?.();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c !== null ? c - 1 : null), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Clean up timers/requests on unmount
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    historyAbortRef.current?.abort();
  }, []);

  // Fetch pending scheduled publishes on mount
  const fetchPendingSchedules = async (executeDue = false) => {
    try {
      // Run due jobs only when the publish controls are actively opened.
      if (executeDue) {
        await fetch('/api/scheduled-publish', { method: 'PATCH' }).catch(() => {});
      }
      const res = await fetch('/api/scheduled-publish', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPendingSchedules(data.schedules ?? []);
      }
    } catch { /* ignore */ }
  };
  useEffect(() => { fetchPendingSchedules(false); }, []);

  const handleCancelSchedule = async (id: string) => {
    setCancellingId(id);
    try {
      const res = await fetch('/api/scheduled-publish', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setPendingSchedules(prev => prev.filter(s => s.id !== id));
      }
    } catch { /* ignore */ } finally {
      setCancellingId(null);
    }
  };

  const fetchHistory = async (force = false) => {
    const isFresh = Date.now() - historyFetchedAtRef.current < HISTORY_CACHE_MS;
    if (!force && historyItems.length > 0 && isFresh) return;

    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;

    setHistoryLoading(true);
    try {
      const res = await fetch('/api/schedule-history', { signal: controller.signal, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data.schedules ?? []);
        historyFetchedAtRef.current = Date.now();
      }
    } catch { /* ignore */ } finally {
      if (historyAbortRef.current === controller) {
        historyAbortRef.current = null;
      }
      setHistoryLoading(false);
    }
  };

  // Core publish logic — refreshed into ref on every render so countdown always fires fresh
  const doPublish = async () => {
    const html = getHTML();
    if (!html) return;

    setStatus('pushing');
    setMessage('');

    try {
      const snapshot = getSnapshotData?.();
      if (!snapshot) throw new Error("Missing snapshot data");

      const res = await fetch('/api/schedule-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...snapshot,
          htmlContent: html,
          embedTarget: publishTarget || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const result = await res.json();
      setStatus('success');
      onSuccess?.(new Date().toISOString());

      // Notify all embed iframes to refresh immediately
      try {
        document.querySelectorAll('iframe').forEach(f => {
          f.contentWindow?.postMessage({ sbRefresh: true }, '*');
        });
      } catch {}

      // Show undo toast — captures prevSchedule at moment of success
      const capturedPrev = prevScheduleRef.current;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (capturedPrev) {
        setUndoToast({ prevSchedule: capturedPrev });
        undoTimerRef.current = setTimeout(() => setUndoToast(null), 8000);
      }

      // Return button to idle after animation
      setTimeout(() => { setStatus('idle'); }, 4000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Publish failed — check server logs');
    }
  };
  // Must update ref on every render so useEffect always has the latest closure
  doPublishRef.current = doPublish;

  /** Called when Publish button is clicked — starts the 5-second countdown */
  const handlePublishClick = () => {
    if (disabled || countdown !== null || status === 'pushing') return;

    // Prefetch the previous schedule for THIS embed so undo can restore it.
    // Scope the query to the current publishTarget so we capture the right row.
    prevScheduleRef.current = null;
    const targetParam = publishTarget ? `?target=${encodeURIComponent(publishTarget)}` : '?target=';
    fetch(`/api/schedule-history${targetParam}`)
      .then(r => r.json())
      .then(async (data) => {
        const latest = data.schedule ?? data.schedules?.[0];
        if (latest?.id) {
          const r2 = await fetch(`/api/schedule-history/${latest.id}`);
          if (r2.ok) {
            const { schedule } = await r2.json();
            prevScheduleRef.current = schedule;
          }
        }
      })
      .catch(() => {});

    setCountdown(5);
  };

  const handleCancelCountdown = () => setCountdown(null);

  /** Reverts WordPress to the schedule that was live before the last publish */
  const handleUndo = async () => {
    const prevSchedule = undoToast?.prevSchedule;
    if (!prevSchedule) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
    setStatus('pushing');
    setMessage('');
    try {
      const res = await fetch('/api/schedule-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekLabel: prevSchedule.week_label,
          dateRangeStart: prevSchedule.date_range_start,
          dateRangeEnd: prevSchedule.date_range_end,
          htmlContent: prevSchedule.html_content,
          eventsSnapshot: prevSchedule.events_snapshot,
          leagueOrder: prevSchedule.league_order,
          featuredLeagues: prevSchedule.featured_leagues,
          embedTarget: prevSchedule.embed_target ?? null,
        }),
      });
      if (!res.ok) throw new Error('Revert failed');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setMessage('Revert failed');
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

  const handleSchedulePublish = async () => {
    if (!scheduleDate || !scheduleTime) return;
    // Enforce only 1 scheduled publish at a time
    if (pendingSchedules.length > 0) {
      setMessage('You already have a scheduled publish. Cancel it first to schedule a new one.');
      setStatus('error');
      return;
    }
    const html = getHTML();
    if (!html) return;
    setIsScheduling(true);
    try {
      const [hours, minutes] = scheduleTime.split(':').map(Number);
      const scheduledAt = new Date(scheduleDate);
      scheduledAt.setHours(hours, minutes, 0, 0);
      if (scheduledAt.getTime() <= Date.now()) {
        setMessage('Scheduled time must be in the future');
        setStatus('error');
        setIsScheduling(false);
        return;
      }
      const snapshot = getSnapshotData?.();
      const res = await fetch('/api/scheduled-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          scheduledAt: scheduledAt.toISOString(),
          weekLabel: snapshot?.weekLabel ?? '',
          dateRangeStart: snapshot?.dateRangeStart,
          dateRangeEnd: snapshot?.dateRangeEnd,
          eventsSnapshot: snapshot?.eventsSnapshot,
          leagueOrder: snapshot?.leagueOrder,
          featuredLeagues: snapshot?.featuredLeagues,
          embedTarget: publishTarget || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Schedule failed' }));
        throw new Error(err.error || 'Schedule failed');
      }
      setScheduledInfo({
        date: scheduledAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        time: scheduleTime,
      });
      setScheduleMode(false);
      setDropdownOpen(false);
      setScheduleDate(undefined);
      setScheduleTime('');
      // Refresh pending list
      fetchPendingSchedules();
      // Auto-dismiss the success info after 6 seconds
      setTimeout(() => setScheduledInfo(null), 6000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Schedule failed');
    } finally {
      setIsScheduling(false);
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
    <div className="relative">
    <div className="flex items-center gap-2">
      {/* History button — LEFT of Publish */}
      <div className="relative" ref={historyRef}>
        <button
          onClick={() => {
            setHistoryOpen((o) => !o);
            setRestoreConfirm(null);
            if (!historyOpen) fetchHistory(false);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground hover:bg-accent transition-colors"
          title="Past schedules"
        >
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">History</span>
        </button>

        {historyOpen && (
          <div className="absolute top-full right-0 mt-1.5 z-50 bg-popover border border-border rounded-lg shadow-2xl shadow-black/40 w-80 max-w-[calc(100vw-1rem)] overflow-hidden animate-in fade-in-0 zoom-in-95">
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
              <div className="max-h-60 overflow-y-auto overflow-x-hidden">
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
                              onRestoreSchedule?.(item.id, item.embed_target);
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
                        className="w-full relative text-left pl-3 pr-4 py-2.5 hover:bg-accent transition-colors flex items-start"
                      >
                        <div className="w-full min-w-0 pr-2">
                          {item.embed_target && (
                            <span className="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 mb-1">
                              {item.embed_target}
                            </span>
                          )}
                          <p className="text-sm text-foreground leading-snug wrap-break-word whitespace-normal">
                            {item.week_label}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 wrap-break-word whitespace-normal">
                            {new Date(item.published_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: selectedTimezone,
                            })}
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

      {/* Countdown view (replaces split button during 5-second window) */}
      {countdown !== null ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 text-sm text-orange-500 font-medium tabular-nums">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            Publishing in {countdown}s…
          </div>
          <button
            onClick={handleCancelCountdown}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      ) : (
        <div className="relative" ref={dropdownRef}>
          {/* Split button */}
          <div className={cn('flex rounded-md overflow-hidden border text-sm font-medium', colorClass)}>
            {/* Main publish action */}
            <button
              onClick={handlePublishClick}
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
              onClick={() => {
                const next = !dropdownOpen;
                setDropdownOpen(next);
                setDeleteConfirm(false);
                setScheduleMode(false);
                if (next) {
                  void fetchPendingSchedules(true);
                }
              }}
              className="flex items-center px-2 py-1.5 hover:bg-white/10 transition-colors"
              aria-label="More publish options"
            >
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-150', dropdownOpen && 'rotate-180')} />
            </button>
          </div>

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="absolute top-full right-0 mt-1.5 z-200 bg-popover border border-border rounded-lg shadow-2xl shadow-black/40 min-w-55 overflow-hidden animate-in fade-in-0 zoom-in-95">
              {/* Schedule Publish */}
              {!scheduleMode && !deleteConfirm && (
                <button
                  onClick={() => { setScheduleMode(true); setDeleteConfirm(false); }}
                  disabled={disabled}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  Schedule publish
                </button>
              )}
              {scheduleMode && (
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule Publish</span>
                    <button onClick={() => setScheduleMode(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  {/* Date picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md border border-border bg-secondary hover:bg-accent transition-colors text-left',
                        !scheduleDate && 'text-muted-foreground'
                      )}>
                        <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                        {scheduleDate ? scheduleDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" side="left">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      />
                    </PopoverContent>
                  </Popover>
                  {/* Time input */}
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  {/* Submit */}
                  <button
                    onClick={handleSchedulePublish}
                    disabled={!scheduleDate || !scheduleTime || isScheduling}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isScheduling && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isScheduling ? 'Scheduling…' : 'Confirm Schedule'}
                  </button>
                </div>
              )}
              {/* Divider between schedule and delete */}
              {!scheduleMode && !deleteConfirm && (
                <div className="h-px bg-border mx-2" />
              )}
              {/* Delete */}
              {!scheduleMode && !deleteConfirm && (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  Delete current schedule
                </button>
              )}
              {deleteConfirm && (
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
      )}

      {/* ── Undo toast (fixed, bottom-right) ───────────────────────────────── */}
      {undoToast && (
        <div className="fixed bottom-5 right-5 z-400 flex items-center gap-3 bg-neutral-900 dark:bg-zinc-800 border border-white/10 text-white px-4 py-3 rounded-xl shadow-2xl animate-in slide-in-from-bottom-3 fade-in-0 duration-300">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">Schedule published</span>
          {undoToast.prevSchedule ? (
            <button
              onClick={handleUndo}
              className="text-sm font-semibold text-orange-400 hover:text-orange-300 underline underline-offset-2 decoration-dotted transition-colors"
            >
              Undo
            </button>
          ) : null}
          <button
            onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoToast(null); }}
            className="ml-1 text-white/40 hover:text-white/80 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* ── Scheduled publish confirmation toast ─────────────────────────── */}
      {scheduledInfo && (
        <div className="fixed bottom-5 right-5 z-400 flex items-center gap-3 bg-neutral-900 dark:bg-zinc-800 border border-white/10 text-white px-4 py-3 rounded-xl shadow-2xl animate-in slide-in-from-bottom-3 fade-in-0 duration-300">
          <Clock className="w-4 h-4 text-orange-400 shrink-0" />
          <span className="text-sm font-medium">
            Scheduled for {scheduledInfo.date} at {scheduledInfo.time}
          </span>
          <button
            onClick={() => setScheduledInfo(null)}
            className="ml-1 text-white/40 hover:text-white/80 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* ── Below-button area (error + pending schedules) ──────────────── */}
      {(message && status === 'error' || pendingSchedules.length > 0) && (
        <div className="absolute top-full right-0 mt-1.5 z-50 flex flex-col gap-1.5 animate-in fade-in-0 duration-150">
          {message && status === 'error' && (
            <div className="max-w-72 px-2.5 py-1.5 rounded-md border border-destructive/30 bg-destructive/10 text-xs text-destructive whitespace-normal shadow-sm">
              {message}
            </div>
          )}
          {pendingSchedules.map((s) => {
            const dt = new Date(s.scheduled_at);
            return (
              <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-orange-500/30 bg-orange-500/10 backdrop-blur-sm text-xs whitespace-nowrap shadow-sm">
                <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="text-foreground font-medium">
                  {dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: selectedTimezone })} at {dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: selectedTimezone })}
                </span>
                {s.week_label && <span className="text-muted-foreground truncate max-w-32">· {s.week_label}</span>}
                <button
                  onClick={() => handleCancelSchedule(s.id)}
                  disabled={cancellingId === s.id}
                  className="ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  title="Cancel scheduled publish"
                >
                  {cancellingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  Cancel
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
