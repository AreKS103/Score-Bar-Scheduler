'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, Sparkles, AlertCircle, CheckSquare, Square, SlidersHorizontal, Clock, SquarePen, Loader2 } from 'lucide-react';
import { useMatchFinder } from './MatchFinderProvider';
import AIMatchCard from './AIMatchCard';
import SmartLogo from '@/components/ui/SmartLogo';
import type { MatchEvent } from '@/types';
import type { MatchRating, MatchFinderResponse } from '@/lib/ai/schemas';
import { getSportConfig, getLeagueAbbrev, getLeaguePopularity, CATEGORY_ORDER, CATEGORY_LOGOS } from '@/lib/config';
import { formatDisplayDate } from '@/lib/timezone';
import { cn } from '@/lib/utils';

interface EmbedInstance {
  display_id: string;
  embed_id: string | null;
}

interface MatchFinderPanelProps {
  /** All events currently in the schedule store */
  events: MatchEvent[];
  /** Embed instances for the embed selector */
  embedInstances: EmbedInstance[];
  /** Currently active embed target */
  publishTarget: string;
  /** Callback when user confirms selected AI matches to add */
  onAddMatches?: (eventIds: string[], embedTarget: string, ratings: Map<string, string>) => void;
  /** User's display name from profile */
  username?: string | null;
}

const QUICK_FILTERS = ['Today', 'This Week', 'This Month'] as const;
const SESSION_KEY = 'ai-match-finder';
const EXCLUDED_CATS_KEY = 'ai-excluded-categories';
const TIME_FILTER_KEY = 'ai-time-filter';

const TIME_PREFIXES = {
  morning: [
    "Good morning",
    "Morning",
    "Rise and shine",
    "Early start today",
  ],
  afternoon: [
    "Good afternoon",
    "Afternoon",
    "Good to see you",
  ],
  evening: [
    "Good evening",
    "Evening",
    "Hope you had a good day",
  ],
  latenight: [
    "It's late-night",
    "Up late, I see",
    "Night owl mode",
    "Still at it this late?",
  ],
} as const

function getGreeting(username?: string | null): { prefix: string; name: string } {
  const hour = new Date().getHours()
  const firstName = username?.trim().split(/\s+/)[0] ?? null

  let bucket: keyof typeof TIME_PREFIXES
  if (hour >= 5 && hour < 12)       bucket = "morning"
  else if (hour >= 12 && hour < 17) bucket = "afternoon"
  else if (hour >= 17 && hour < 21) bucket = "evening"
  else                               bucket = "latenight"

  const options = TIME_PREFIXES[bucket]
  const prefix = options[Math.floor(Math.random() * options.length)]

  return { prefix, name: firstName ?? "there" }
}

export default function MatchFinderPanel({
  events,
  embedInstances,
  publishTarget,
  onAddMatches,
  username,
}: MatchFinderPanelProps) {
  const { isOpen, close } = useMatchFinder();
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Map<string, MatchRating['importance']>>(new Map());
  const [hasResult, setHasResult] = useState(false);
  // Local selection state for AI results (independent of schedule store)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetEmbed, setTargetEmbed] = useState(publishTarget);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(EXCLUDED_CATS_KEY);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [showCatFilter, setShowCatFilter] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number | null>(null);
  const [timeFrom, setTimeFrom] = useState<string>(() => {
    try { return (JSON.parse(localStorage.getItem(TIME_FILTER_KEY) || 'null') as { from?: string } | null)?.from ?? ''; }
    catch { return ''; }
  });
  const [timeTo, setTimeTo] = useState<string>(() => {
    try { return (JSON.parse(localStorage.getItem(TIME_FILTER_KEY) || 'null') as { to?: string } | null)?.to ?? ''; }
    catch { return ''; }
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleCloseRef = useRef<() => void>(() => {});

  const greeting = useMemo(() => getGreeting(username), [username]);

  // Persist excluded categories
  useEffect(() => {
    try {
      localStorage.setItem(EXCLUDED_CATS_KEY, JSON.stringify(Array.from(excludedCategories)));
    } catch { /* ignore */ }
  }, [excludedCategories]);

  // Persist time filter
  useEffect(() => {
    try {
      if (timeFrom || timeTo) localStorage.setItem(TIME_FILTER_KEY, JSON.stringify({ from: timeFrom, to: timeTo }));
      else localStorage.removeItem(TIME_FILTER_KEY);
    } catch { /* ignore */ }
  }, [timeFrom, timeTo]);

  // Filter events by excluded categories
  const filteredEvents = useMemo(
    () => excludedCategories.size === 0
      ? events
      : events.filter(e => !excludedCategories.has(e.category)),
    [events, excludedCategories]
  );

  const toggleCategory = useCallback((cat: string) => {
    setExcludedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Sync target embed when publish target changes externally
  useEffect(() => { setTargetEmbed(publishTarget); }, [publishTarget]);

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (!saved) return;
      const { ratingsArr, filter } = JSON.parse(saved) as {
        ratingsArr: [string, string][];
        filter: string;
      };
      if (ratingsArr?.length) {
        setRatings(new Map(ratingsArr as [string, MatchRating['importance']][]) );
        setHasResult(true);
        setActiveFilter(filter);
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) handleCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  // Close when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (isOpen && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleCloseRef.current();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen, close]);

  // ── Rated events: only high/must_watch, ordered by importance then league popularity ──
  const ratedEvents = useMemo(() => {
    if (!hasResult) return [];
    const order: Record<string, number> = { must_watch: 0, high: 1 };
    return filteredEvents
      .filter((e) => {
        const imp = ratings.get(e.id);
        return imp === 'must_watch' || imp === 'high';
      })
      .sort((a, b) => {
        const ra = order[ratings.get(a.id)!] ?? 2;
        const rb = order[ratings.get(b.id)!] ?? 2;
        if (ra !== rb) return ra - rb;
        // Secondary: league popularity (higher score first)
        const pa = getLeaguePopularity(getLeagueAbbrev(a.leagueLabel));
        const pb = getLeaguePopularity(getLeagueAbbrev(b.leagueLabel));
        if (pa !== pb) return pb - pa;
        return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      });
  }, [filteredEvents, ratings, hasResult]);

  // ── Group rated events by league (sportId), sorted by league popularity ──
  const groupedByLeague = useMemo(() => {
    const map = new Map<string, MatchEvent[]>();
    for (const ev of ratedEvents) {
      if (!map.has(ev.sportId)) map.set(ev.sportId, []);
      map.get(ev.sportId)!.push(ev);
    }
    // Re-sort map entries by league popularity (highest first)
    const sorted = new Map(
      [...map.entries()].sort(([aId], [bId]) => {
        const aConf = getSportConfig(aId);
        const bConf = getSportConfig(bId);
        const pa = getLeaguePopularity(getLeagueAbbrev(aConf?.label ?? ''));
        const pb = getLeaguePopularity(getLeagueAbbrev(bConf?.label ?? ''));
        return pb - pa;
      })
    );
    return sorted;
  }, [ratedEvents]);

  // Pre-select matches that are already selected in the user's schedule
  useEffect(() => {
    if (!hasResult) return;
    const alreadySelected = new Set(
      filteredEvents.filter((e) => e.isSelected && ratings.has(e.id)).map((e) => e.id)
    );
    setSelectedIds(alreadySelected);
  }, [hasResult, filteredEvents, ratings]);

  const handleSubmit = useCallback(async (filter: string) => {
    setIsLoading(true);
    setError(null);
    setActiveFilter(filter);
    setHasResult(false);

    try {
      // ── Filter events by time range if quick filter used ──────────────────
      let filtered = filteredEvents;
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      if (filter === 'Today') {
        filtered = filteredEvents.filter((e) => e.date === todayStr);
      } else if (filter === 'This Week') {
        const endOfWeek = new Date(now);
        endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
        const endStr = endOfWeek.toISOString().split('T')[0];
        filtered = filteredEvents.filter((e) => e.date >= todayStr && e.date <= endStr);
      } else if (filter === 'This Month') {
        // Use next 30 days so the filter is useful regardless of where we are in the month
        const next30 = new Date(now);
        next30.setDate(now.getDate() + 30);
        const endStr = next30.toISOString().split('T')[0];
        filtered = filteredEvents.filter((e) => e.date >= todayStr && e.date <= endStr);
      }

      // ── Time-of-day filter (pre-AI) ─────────────────────────────────────
      if (timeFrom || timeTo) {
        filtered = filtered.filter((e) => {
          if (!e.time) return true;
          const t = e.time;
          if (timeFrom && timeTo) {
            // Overnight range (e.g. 22:00 → 02:00) wraps around midnight
            return timeTo >= timeFrom ? t >= timeFrom && t <= timeTo : t >= timeFrom || t <= timeTo;
          }
          if (timeFrom) return t >= timeFrom;
          return t <= timeTo;
        });
      }

      if (filtered.length === 0) {
        setError('No matches found for the selected time range.');
        setIsLoading(false);
        return;
      }

      // ── Build ultra-compact grouped format with abbreviations ────────────
      const idMap: string[] = [];
      const groups: Record<string, string[]> = {};

      for (const e of filtered) {
        const idx = idMap.length;
        idMap.push(e.id);
        const abbrev = getLeagueAbbrev(e.leagueLabel);
        if (!groups[abbrev]) groups[abbrev] = [];
        const title = e.away ? `${e.home} v ${e.away}` : e.home;
        groups[abbrev].push(`${idx}:${title}`);
      }

      // Determine filter type for server-side budget caps
      const filterType = filter === 'Today' ? 'today'
        : filter === 'This Month' ? 'month'
        : 'week';

      // "All matches" triggers scan mode — more inclusive AI sweep
      const scanMode = filter === 'all';

      const res = await fetch('/api/ai/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups, filterType, scanMode }),
      });

      if (!res.ok) {
        // Still capture rate-limit on 429
        const rlHeader = res.headers.get('X-RateLimit-Remaining');
        if (rlHeader !== null) setRateLimitRemaining(parseInt(rlHeader, 10));
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      // Capture rate-limit remaining from response header
      const rlRemaining = res.headers.get('X-RateLimit-Remaining');
      if (rlRemaining !== null) setRateLimitRemaining(parseInt(rlRemaining, 10));

      const data: MatchFinderResponse = await res.json();

      // Build ratings map — map numeric indices back to real event IDs
      const newRatings = new Map<string, MatchRating['importance']>();
      for (const r of data.ids) {
        const realId = idMap[parseInt(r.id, 10)];
        if (realId) {
          newRatings.set(realId, r.importance);
        }
      }
      setRatings(newRatings);
      setHasResult(true);

      // Save to sessionStorage
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          ratingsArr: Array.from(newRatings.entries()),
          filter,
        }));
      } catch { /* quota exceeded */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [filteredEvents]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(ratedEvents.map((e) => e.id)));
  }, [ratedEvents]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleAddToSchedule = useCallback(() => {
    if (selectedIds.size === 0 || !onAddMatches || isAdding) return;
    setIsAdding(true);
    // Only pass ratings for the events being added
    const selectedRatings = new Map<string, string>();
    for (const id of selectedIds) {
      const imp = ratings.get(id);
      if (imp) selectedRatings.set(id, imp);
    }
    onAddMatches(Array.from(selectedIds), targetEmbed, selectedRatings);
    // Brief feedback before auto-closing
    setTimeout(() => setIsAdding(false), 600);
  }, [selectedIds, targetEmbed, ratings, onAddMatches, isAdding]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      close();
    }, 280);
  }, [close]); 

  const handleNewChat = useCallback(() => {
    setActiveFilter(null);
    setHasResult(false);
    setRatings(new Map());
    setSelectedIds(new Set());
    setError(null);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }, []);

  handleCloseRef.current = handleClose;

  if (!isOpen) return null;

  const allSelected = ratedEvents.length > 0 && selectedIds.size === ratedEvents.length;
  const someSelected = selectedIds.size > 0;

  return (
    <>
      {/* Backdrop */}
      <div className={cn(
        'fixed inset-0 z-200 bg-black/20 backdrop-blur-[2px] transition-opacity duration-280',
        isClosing && 'opacity-0'
      )} />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed z-201 top-4 right-4 bottom-4 w-[calc(100vw-2rem)] sm:w-110 flex flex-col rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl duration-300',
          isClosing ? 'animate-out slide-out-to-right fill-mode-forwards' : 'animate-in slide-in-from-right'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50 shrink-0 bg-linear-to-r from-primary/5 to-transparent rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">AI Match Finder</h2>
              {rateLimitRemaining !== null && (
                <p className={cn('text-[10px] leading-tight', rateLimitRemaining <= 5 ? 'text-orange-500' : 'text-muted-foreground/70')}>
                  {rateLimitRemaining} {rateLimitRemaining === 1 ? 'use' : 'uses'} left today
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeFilter && (
              <button
                type="button"
                onClick={handleNewChat}
                className="rounded-full p-1.5 pr-2.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center gap-1.5 text-xs font-medium"
                aria-label="New chat"
                title="New chat"
              >
                <SquarePen className="w-4 h-4" />
                New chat
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {/* Hero — centered greeting + quick filters (before interaction) */}
          {!activeFilter && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-in fade-in duration-500">
              <div className="mb-5">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {greeting.prefix}, {greeting.name}!
                </h1>
                <p className="text-[13px] text-muted-foreground mt-2.5 max-w-70 mx-auto leading-relaxed">
                  I&apos;ll find the best matches worth putting on the big screen.
                </p>
              </div>
              {/* Time-of-day filter */}
              <div className="flex items-center justify-center gap-2 mb-4 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
                <span className="shrink-0">Hours</span>
                <input
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  className="bg-muted/50 border border-border/60 rounded-md px-2 py-0.5 text-xs text-foreground w-24 focus:outline-none focus:border-primary/50"
                  aria-label="From time"
                />
                <span className="shrink-0 text-muted-foreground/60">→</span>
                <input
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  className="bg-muted/50 border border-border/60 rounded-md px-2 py-0.5 text-xs text-foreground w-24 focus:outline-none focus:border-primary/50"
                  aria-label="To time"
                />
                {(timeFrom || timeTo) && (
                  <button
                    type="button"
                    onClick={() => { setTimeFrom(''); setTimeTo(''); }}
                    className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    aria-label="Clear time filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Category filter — toggle unwanted sports before scanning */}
              <div className="flex flex-wrap justify-center gap-1 mb-6 max-w-xs mx-auto">
                {CATEGORY_ORDER.map((cat) => {
                  const isExcluded = excludedCategories.has(cat);
                  const logoUrl = CATEGORY_LOGOS[cat];
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all flex items-center gap-1',
                        isExcluded
                          ? 'bg-muted/30 border-border/40 text-muted-foreground/40 line-through'
                          : 'bg-accent/50 border-primary/20 text-foreground'
                      )}
                    >
                      {logoUrl && (
                        <SmartLogo logo={logoUrl} alt="" className="w-3 h-3 object-contain" />
                      )}
                      {cat}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {QUICK_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleSubmit(f)}
                    disabled={filteredEvents.length === 0}
                    className="rounded-full border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary/30 transition-all disabled:opacity-40"
                  >
                    {f}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleSubmit('all')}
                  disabled={filteredEvents.length === 0}
                  className="rounded-full border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary/30 transition-all disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  All {filteredEvents.length} matches
                </button>
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && (
            <div className="px-4 py-3 space-y-2 animate-in fade-in duration-200">
              <div className="h-3 w-40 rounded bg-muted/60 animate-pulse mb-3" />
              {([3, 2, 2] as const).map((rows, i) => (
                <div key={i} className="rounded-xl border border-border/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border/30">
                    <div className="w-4 h-4 rounded bg-muted/70 animate-pulse" />
                    <div className={cn('h-2.5 rounded bg-muted/70 animate-pulse', i === 0 ? 'w-16' : i === 1 ? 'w-20' : 'w-24')} />
                    <div className="ml-auto h-2 w-10 rounded bg-muted/50 animate-pulse" />
                  </div>
                  <div className="p-1.5 space-y-1">
                    {Array.from({ length: rows }).map((_, j) => (
                      <div key={j} className="rounded-lg bg-muted/40 h-11 animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {activeFilter && error && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 animate-in fade-in duration-300">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}

          {/* Results */}
          {activeFilter && hasResult && !isLoading && !error && (
            <div className="px-4 py-3 space-y-2 animate-in fade-in duration-300">
              {ratedEvents.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Found <span className="font-semibold text-primary">{ratedEvents.length}</span> match{ratedEvents.length !== 1 ? 'es' : ''} worth watching{activeFilter !== 'all' ? ` for ${activeFilter.toLowerCase()}` : ''}.
                  </p>
                  <div className="space-y-2">
                    {Array.from(groupedByLeague.entries()).map(([sportId, leagueEvents]) => {
                      const config = getSportConfig(sportId);
                      const byDate = new Map<string, MatchEvent[]>();
                      for (const ev of leagueEvents) {
                        if (!byDate.has(ev.date)) byDate.set(ev.date, []);
                        byDate.get(ev.date)!.push(ev);
                      }

                      return (
                        <div key={sportId} className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm">
                          <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-card/95 backdrop-blur-md rounded-t-xl border-b border-border/30">
                            {config?.logo && (
                              <SmartLogo logo={config.logo} alt={config.label} className="h-4 w-4" />
                            )}
                            <span className="text-xs font-semibold text-foreground">
                              {config?.label ?? sportId}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {leagueEvents.length} match{leagueEvents.length !== 1 ? 'es' : ''}
                            </span>
                          </div>
                          <div className="p-1.5 space-y-1">
                            {Array.from(byDate.entries()).map(([date, dayEvents]) => (
                              <div key={date} className="space-y-1">
                                <div className="text-[10px] font-medium text-muted-foreground pl-1.5 pt-0.5">
                                  {formatDisplayDate(date)}
                                </div>
                                {dayEvents.map((ev) => (
                                  <AIMatchCard
                                    key={ev.id}
                                    event={ev}
                                    importance={ratings.get(ev.id) ?? 'medium'}
                                    isSelected={selectedIds.has(ev.id)}
                                    onToggle={toggleSelect}
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">No matches found. Try a different time range!</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom controls — visible after first interaction */}
        {activeFilter && !isLoading && (
          <div className="shrink-0 px-4 py-2.5 border-t border-border/50 space-y-2 animate-in slide-in-from-bottom-2 duration-300">
            {showCatFilter && (
              <div className="flex flex-wrap gap-1 pb-1">
                {CATEGORY_ORDER.map((cat) => {
                  const isExcluded = excludedCategories.has(cat);
                  const logoUrl = CATEGORY_LOGOS[cat];
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all flex items-center gap-1',
                        isExcluded
                          ? 'bg-muted/30 border-border/40 text-muted-foreground/50 line-through'
                          : 'bg-accent/50 border-primary/20 text-foreground'
                      )}
                    >
                      {logoUrl && (
                        <SmartLogo logo={logoUrl} alt="" className="w-3 h-3 object-contain" />
                      )}
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowCatFilter(v => !v)}
                className={cn(
                  'rounded-full border p-1.5 transition-all',
                  showCatFilter
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  excludedCategories.size > 0 && !showCatFilter && 'border-amber-500/40 text-amber-600 dark:text-amber-400'
                )}
                title="Filter sports categories"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
              {QUICK_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleSubmit(f)}
                  disabled={isLoading || filteredEvents.length === 0}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                    activeFilter === f
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/50 border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    'disabled:opacity-40'
                  )}
                >
                  {f}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleSubmit('all')}
                disabled={isLoading || filteredEvents.length === 0}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1',
                  activeFilter === 'all'
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  'disabled:opacity-40'
                )}
              >
                <Sparkles className="w-3 h-3" />
                All {filteredEvents.length} matches
              </button>
            </div>

            {hasResult && ratedEvents.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={allSelected ? deselectAll : selectAll}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    {allSelected ? 'Deselect all' : 'Select all'} ({selectedIds.size}/{ratedEvents.length})
                  </button>
                </div>

                {embedInstances.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground shrink-0">Add to:</span>
                    <div className="flex flex-wrap gap-1">
                      {embedInstances.map((inst) => {
                        const val = inst.embed_id ?? inst.display_id;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setTargetEmbed(val)}
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors',
                              val === targetEmbed
                                ? 'bg-primary/15 border-primary/40 text-primary'
                                : 'bg-muted/50 border-border text-muted-foreground hover:bg-accent'
                            )}
                          >
                            {inst.display_id}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Add to schedule footer */}
        {hasResult && someSelected && (
          <div className="shrink-0 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={handleAddToSchedule}
              disabled={isAdding}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding…
                </>
              ) : (
                <>Add {selectedIds.size} match{selectedIds.size !== 1 ? 'es' : ''} to schedule</>
              )}
            </button>
          </div>
        )}

        {/* Powered by */}
        <div className="shrink-0 border-t border-border/50 px-4 py-1.5">
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Powered by AI · Results may not be 100% accurate
          </p>
        </div>
      </div>
    </>
  );
}
