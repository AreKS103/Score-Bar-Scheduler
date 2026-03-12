'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  CheckSquare,
  Square,
  Tag,
  Loader2,
  RefreshCw,
  Settings,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Menu,
  LogOut,
  Pencil,
} from 'lucide-react';
import { useScheduleStore } from '@/lib/store';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useFavoritesStore } from '@/lib/favoritesStore';
import { getCachedEvents, setCachedEvents, saveSelectionToSupabase, loadSelectionFromSupabase, loadSelectionState, type SavedSelectionState } from '@/lib/clientCache';
import { generateHTML } from '@/lib/generateHTML';
import { SPORTS_CONFIG, getCategories, ALL_SCREEN_TAGS } from '@/lib/config';
import { formatDisplayDate } from '@/lib/timezone';
import type { ScreenTag, MatchEvent } from '@/types';
import SportFilter from '@/components/SportFilter';
import LeagueSection from '@/components/LeagueSection';
import AddMatchModal from '@/components/AddMatchModal';
import EditMatchModal from '@/components/EditMatchModal';
import PublishButton from '@/components/PublishButton';
import DateRangeCalendar from '@/components/DateRangeCalendar';
import SearchField from '@/components/SearchField';
import PreviewPanel from '@/components/PreviewPanel';
import SettingsModal from '@/components/SettingsModal';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function SchedulePage() {
  const {
    events,
    fetchStatuses,
    dateRange,
    activeSportFilter,
    setEvents,
    addEvents,
    toggleSelected,
    toggleFeatured,
    toggleTag,
    updateEvent,
    selectAll,
    deselectAll,
    batchSetSelected,
    setFetchStatus,
    setDateRange,
    setActiveSportFilter,
  } = useScheduleStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MatchEvent | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [searchFilterIds, setSearchFilterIds] = useState<Set<string> | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewCheckedIds, setPreviewCheckedIds] = useState<Set<string>>(new Set());
  const [leagueOrder, setLeagueOrder] = useState<string[]>([]);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [panelWidth, setPanelWidth] = useState(700);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [featuredLeagues, setFeaturedLeagues] = useState<Map<string, string>>(new Map());
  const [flashKey, setFlashKey] = useState(0);
  const router = useRouter();

  // ─── Client-side auth guard ─────────────────────────────────────────────────
  // Redirect to /login if the Supabase session has expired or been revoked.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    // Check on mount
    supabase.auth.getUser().then(({ error }) => {
      if (error) router.push('/login');
    });
    // Listen for sign-out / token-refresh failures
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function handleLogout() {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push('/login');
  }
  const [activeSortLeague, setActiveSortLeague] = useState<string | null>(null);
  // Increments on every moveLeague call — guarantees html useMemo always recomputes
  const [sortVersion, setSortVersion] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(116);
  const hasFetchedRef = useRef(false);
  const prevSelectedCountRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const widthRef = useRef(700);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const leagueItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const htmlPreviewRef = useRef<HTMLDivElement>(null);
  // Ref mirror of selectedByLeague so moveLeague never closes over stale data
  const selectedByLeagueRef = useRef<Map<string, MatchEvent[]>>(new Map());

  // ─── Fetch all sports data via Server API (cached) ───────────────────────────
  const handleFetch = useCallback(async (forceRefresh = false) => {
    // IMPORTANT: Capture saved selection state BEFORE any cache loading triggers
    // the debounced save effect (which would overwrite localStorage with empty data).
    // Use sync localStorage load first (instant), Supabase will override on mount.
    const savedState = loadSelectionState();
    const savedSel = savedState?.selections ?? {};

    // Try to load from client cache first for instant display
    if (!forceRefresh && events.length === 0) {
      const cached = getCachedEvents(dateRange);
      if (cached && cached.length > 0) {
        console.log(`[Schedule] Instant load: ${cached.length} events from local cache`);
        // Merge cached events with saved selections so user sees picks immediately
        const mergedCached = cached.map(e => {
          const saved = savedSel[e.id];
          if (saved) return { ...e, ...saved };
          return e;
        });
        setEvents(mergedCached);
        // Still fetch fresh data in background
      }
    }

    setIsFetching(true);
    SPORTS_CONFIG.forEach((s) =>
      setFetchStatus(s.id, { loading: true, error: null })
    );

    try {
      // Use new cached API endpoint
      const url = `/api/events?start=${dateRange.start}&end=${dateRange.end}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const allEventsRaw = data.events ?? [];
      
      // Build in-memory selection map (for manual refresh while page is open)
      const memSel = new Map(
        events.map(e => [e.id, { isSelected: e.isSelected, isFeatured: e.isFeatured, tags: e.tags }])
      );
      
      // Merge with preserved selections (in-memory > localStorage > default)
      const allEvents = allEventsRaw.map((e: MatchEvent) => {
        // In-memory takes priority (user is actively using the page)
        const mem = memSel.get(e.id);
        if (mem && (mem.isSelected || mem.isFeatured || mem.tags.length > 0)) return { ...e, ...mem };
        // Fall back to captured localStorage (restores state after page reload)
        const saved = savedSel[e.id];
        if (saved) return { ...e, ...saved };
        return e;
      });

      setEvents(allEvents);
      
      // Save to client cache (without selection state for clean cache)
      setCachedEvents(dateRange, allEventsRaw);
      
      // Mark all leagues as loaded
      SPORTS_CONFIG.forEach((s) =>
        setFetchStatus(s.id, { loading: false, error: null })
      );

      if (data.cached) {
        console.log(`[Schedule] Loaded ${allEvents.length} events (server cached, age: ${data.age}s${data.stale ? ', stale' : ''})`);
      } else {
        console.log(`[Schedule] Loaded ${allEvents.length} events (fresh from APIs)`);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      SPORTS_CONFIG.forEach((s) =>
        setFetchStatus(s.id, { loading: false, error: 'Fetch failed' })
      );
    } finally {
      setIsFetching(false);
    }
  }, [dateRange, events, setEvents, setFetchStatus]);

  // ─── Auto-fetch on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      // Restore league order + featured leagues from localStorage first (instant)
      const saved = loadSelectionState();
      if (saved) {
        if (saved.leagueOrder.length > 0) setLeagueOrder(saved.leagueOrder);
        if (Object.keys(saved.featuredLeagues).length > 0) {
          setFeaturedLeagues(new Map(Object.entries(saved.featuredLeagues)));
        }
      }
      if (window.innerWidth < 768) {
        const vw = window.innerWidth;
        setPanelWidth(vw);
        widthRef.current = vw;
      }
      handleFetch();
      useFavoritesStore.getState().loadFromSupabase();
      // After initial fetch, try to load from Supabase (may override localStorage)
      loadSelectionFromSupabase().then(supaState => {
        if (!supaState) return;
        if (supaState.leagueOrder.length > 0) setLeagueOrder(supaState.leagueOrder);
        if (Object.keys(supaState.featuredLeagues).length > 0) {
          setFeaturedLeagues(new Map(Object.entries(supaState.featuredLeagues)));
        }
      });
    }
  }, [handleFetch]);

  // ─── Filtered events (sport filter + search) ──────────────────────────────
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Sport filter
    if (activeSportFilter !== 'All') {
      const isCategory = getCategories().includes(activeSportFilter);
      if (isCategory) {
        filtered = filtered.filter((e) => e.category === activeSportFilter);
      } else {
        filtered = filtered.filter((e) => e.sportId === activeSportFilter);
      }
    }

    // Search filter
    if (searchFilterIds) {
      filtered = filtered.filter((e) => searchFilterIds.has(e.id));
    }

    return filtered;
  }, [events, activeSportFilter, searchFilterIds]);

  // ─── Group events by league ────────────────────────────────────────────────
  const groupedByLeague = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const event of filteredEvents) {
      if (!map.has(event.sportId)) map.set(event.sportId, []);
      map.get(event.sportId)!.push(event);
    }
    return map;
  }, [filteredEvents]);

  // ─── Stats (memoized to avoid recompute on unrelated changes) ────────────
  const selectedCount = useMemo(() => events.filter((e) => e.isSelected).length, [events]);
  const totalCount = events.length;
  const selectedLeagues = useMemo(
    () => new Set(events.filter((e) => e.isSelected).map((e) => e.sportId)).size,
    [events]
  );

  // ─── Selected events grouped by league (for preview sidebar) ─────────────
  const selectedByLeague = useMemo(() => {
    const sel = events.filter((e) => e.isSelected);
    const map = new Map<string, MatchEvent[]>();
    for (const e of sel) {
      if (!map.has(e.sportId)) map.set(e.sportId, []);
      map.get(e.sportId)!.push(e);
    }
    return map;
  }, [events]);

  // Keep leagueOrder in sync: preserve user's order, append new leagues, drop removed ones
  useEffect(() => {
    setLeagueOrder((prev) => {
      const keys = Array.from(selectedByLeague.keys());
      const existing = prev.filter((k) => selectedByLeague.has(k));
      const added = keys.filter((k) => !prev.includes(k));
      return [...existing, ...added];
    });
  }, [selectedByLeague]);

  // ─── Auto-save selection state (debounced 800ms) ──────────────────────────
  // Persists selections, tags, league order, and featured leagues to localStorage
  // so they survive page refreshes. Skips while fetching to avoid overwriting
  // saved state with intermediate (unmerged) event data.
  useEffect(() => {
    if (events.length === 0 || isFetching) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const selections: SavedSelectionState['selections'] = {};
      for (const e of events) {
        if (e.isSelected || e.isFeatured || e.tags.length > 0) {
          selections[e.id] = { isSelected: e.isSelected, isFeatured: e.isFeatured, tags: e.tags };
        }
      }
      saveSelectionToSupabase({
        selections,
        leagueOrder,
        featuredLeagues: Object.fromEntries(featuredLeagues),
        savedAt: Date.now(),
      });
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [events, leagueOrder, featuredLeagues, isFetching]);

  // ─── Auto-show panel on first selection; auto-hide when none ─────────────
  useEffect(() => {
    if (selectedCount > prevSelectedCountRef.current) {
      setPreviewOpen(true);
    }
    if (selectedCount === 0) {
      setPreviewOpen(false);
      setPreviewCheckedIds(new Set());
      setDeleteAllConfirm(false);
    }
    prevSelectedCountRef.current = selectedCount;
  }, [selectedCount]);

  // Sync panel DOM width on state change (width is managed outside React for resize perf)
  useEffect(() => {
    if (panelRef.current) panelRef.current.style.width = `${panelWidth}px`;
  }, [panelWidth]);

  // Keep ref mirror of selectedByLeague up-to-date on every render
  selectedByLeagueRef.current = selectedByLeague;

  // Scroll active sort league into view (centered) when order changes
  useEffect(() => {
    if (!activeSortLeague) return;
    const container = sidebarScrollRef.current;
    const el = leagueItemRefs.current.get(activeSortLeague);
    if (!el) return;
    if (!container) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Center the moved league within the scroll container
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const relTop = elRect.top - containerRect.top + container.scrollTop;
    const targetScroll = relTop - (container.clientHeight / 2) + (elRect.height / 2);
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [leagueOrder, activeSortLeague]);

  const orderedSelectedByLeague = useMemo(
    () => leagueOrder
      .filter((l) => selectedByLeague.has(l))
      .map((l) => [l, selectedByLeague.get(l)!] as [string, MatchEvent[]]),
    [leagueOrder, selectedByLeague]
  );

  // NOTE: main schedule list uses natural groupedByLeague order (unchanged by panel reordering)

  const moveLeague = useCallback((league: string, dir: -1 | 1) => {
    setActiveSortLeague(league);
    setSortVersion((v) => v + 1); // Always different → html useMemo always recomputes
    setLeagueOrder((prev) => {
      // Build the visible-only order from the current leagueOrder so we always
      // swap with the correct visible neighbour (prev may contain non-selected
      // IDs that haven't been pruned by the sync effect yet).
      const visibleOrder = prev.filter((l) => selectedByLeagueRef.current.has(l));
      const visIdx = visibleOrder.indexOf(league);
      const nextVisIdx = visIdx + dir;
      if (nextVisIdx < 0 || nextVisIdx >= visibleOrder.length) return prev;
      const neighbor = visibleOrder[nextVisIdx];
      const arr = [...prev];
      const idxA = arr.indexOf(league);
      const idxB = arr.indexOf(neighbor);
      if (idxA === -1 || idxB === -1) return prev;
      [arr[idxA], arr[idxB]] = [arr[idxB], arr[idxA]];
      return arr;
    });
  }, []);

  const toggleFeaturedLeague = useCallback((sportId: string) => {
    setFeaturedLeagues((prev) => {
      const next = new Map(prev);
      if (next.has(sportId)) next.delete(sportId);
      else next.set(sportId, '');
      return next;
    });
  }, []);

  const bulkSelectLeague = useCallback((sportId: string, selectAll: boolean) => {
    const ids = events.filter((e) => e.sportId === sportId).map((e) => e.id);
    batchSetSelected(ids, selectAll);
  }, [events, batchSetSelected]);

  const handleDeleteSchedule = useCallback(async () => {
    await fetch('/api/delete-schedule', { method: 'POST' });
  }, []);

  // ─── Measure header height for panel positioning ────────────────────────────
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setHeaderHeight(el.getBoundingClientRect().height);
    });
    obs.observe(el);
    setHeaderHeight(el.getBoundingClientRect().height);
    return () => obs.disconnect();
  }, []);

  const togglePreviewCheck = useCallback((id: string) => {
    setPreviewCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handlePreviewDelete = useCallback(() => {
    previewCheckedIds.forEach((id) => toggleSelected(id));
    setPreviewCheckedIds(new Set());
  }, [previewCheckedIds, toggleSelected]);

  const handleDeleteAll = useCallback(() => {
    events.filter((e) => e.isSelected).forEach((e) => toggleSelected(e.id));
    setDeleteAllConfirm(false);
    setPreviewCheckedIds(new Set());
  }, [events, toggleSelected]);

  // ─── HTML generation — recomputes whenever leagueOrder, events, or sortVersion changes ─
  const html = useMemo(
    () => selectedCount > 0 ? generateHTML(events, leagueOrder, featuredLeagues) : '',
    [events, leagueOrder, sortVersion, selectedCount, featuredLeagues] // sortVersion is the safety net
  );

  // Scroll HTML preview back to top whenever the league order changes so the reorder is visible
  useEffect(() => {
    if (htmlPreviewRef.current) htmlPreviewRef.current.scrollTop = 0;
  }, [leagueOrder]);
  // Keep a ref for publish/copy so it always has the latest
  const htmlRef = useRef('');
  useEffect(() => { if (html) htmlRef.current = html; }, [html]);
  const getHTML = useCallback(() => htmlRef.current || generateHTML(events, undefined, featuredLeagues), [events, featuredLeagues]);

  const activeBulkTags = useMemo(() => {
    const sel = events.filter((e) => e.isSelected);
    if (sel.length === 0) return new Set<ScreenTag>();
    const result = new Set<ScreenTag>();
    for (const tag of ALL_SCREEN_TAGS) {
      if (sel.every((e) => e.tags.includes(tag))) result.add(tag);
    }
    return result;
  }, [events]);

  const handleBulkTag = useCallback((tag: ScreenTag) => {
    const sel = events.filter((e) => e.isSelected);
    const isActive = activeBulkTags.has(tag);
    sel.forEach((e) => {
      const hasTag = e.tags.includes(tag);
      if (isActive && hasTag) toggleTag(e.id, tag);   // remove from all
      if (!isActive && !hasTag) toggleTag(e.id, tag); // add to all
    });
    // dialog stays open for further tagging
  }, [events, toggleTag, activeBulkTags]);

  const handleCopyHTML = useCallback(async () => {
    const content = getHTML();
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getHTML]);



  // Optimized resize — mutates DOM directly, React state only updates on pointer-up
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const panel = panelRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      const vw = window.innerWidth;
      const minW = vw < 768 ? vw : 420;
      const maxW = vw < 768 ? vw : 1400;
      const newW = Math.max(minW, Math.min(maxW, startW + startX - ev.clientX));
      widthRef.current = newW;
      if (panel) panel.style.width = `${newW}px`;
      // Move the toggle button in sync with the panel edge
      if (toggleBtnRef.current) toggleBtnRef.current.style.right = `${newW}px`;
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setPanelWidth(widthRef.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
  }, []);

  const getSnapshotData = useCallback(() => ({
    weekLabel: `${formatDisplayDate(dateRange.start)} – ${formatDisplayDate(dateRange.end)}`,
    dateRangeStart: dateRange.start,
    dateRangeEnd: dateRange.end,
    eventsSnapshot: events.filter((e) => e.isSelected),
    leagueOrder,
    featuredLeagues: Object.fromEntries(featuredLeagues),
  }), [dateRange, events, leagueOrder, featuredLeagues]);

  const handleRestoreSchedule = useCallback(async (scheduleId: string) => {
    try {
      const res = await fetch(`/api/schedule-history/${scheduleId}`);
      if (!res.ok) return;
      const { schedule } = await res.json();
      if (!schedule) return;

      const restored: MatchEvent[] = schedule.events_snapshot;
      setEvents(restored);
      setLeagueOrder(schedule.league_order || []);
      const fl = new Map<string, string>(Object.entries(schedule.featured_leagues || {}));
      setFeaturedLeagues(fl);
      setPreviewOpen(true);
    } catch (e) {
      console.error('Failed to restore schedule:', e);
    }
  }, [setEvents]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* ── Mobile sidebar backdrop ───────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-150 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          // Desktop: static sidebar
          'w-64 shrink-0 border-r border-border bg-sidebar overflow-y-auto overflow-x-hidden',
          // Mobile: slide-out drawer
          'fixed inset-y-0 left-0 z-160 transition-transform duration-200 ease-in-out md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="pt-2 pb-1">
          {/* CSS-based logo swap — no JS re-render on theme toggle */}
          <img
            src="/Score WEB Black Transp.png"
            alt="SCORE Sports Bar"
            className="w-full h-37 object-contain object-center dark:hidden"
          />
          <img
            src="/Score WEB White Transp.png"
            alt="SCORE Sports Bar"
            className="w-full h-37 object-contain object-center hidden dark:block"
          />
          <p className="text-[10px] text-muted-foreground text-center mt-0.5">Sports Bar &amp; Grill · Phnom Penh</p>
        </div>

        <Separator className="mx-3" />

        <div className="px-2 pt-2">
          <SportFilter
            activeFilter={activeSportFilter}
            onFilterChange={(f) => { setActiveSportFilter(f); setFlashKey(k => k + 1); setSidebarOpen(false); }}
            events={events}
          />
        </div>

        <Separator className="mx-3 mt-3" />

        <div className="p-3 space-y-0.5">
          <button
            onClick={() => { setSettingsOpen(true); setSidebarOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-all text-muted-foreground hover:text-destructive hover:bg-accent"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Area ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header ref={headerRef} className="shrink-0 border-b border-border bg-background/95 backdrop-blur-sm px-3 sm:px-6 py-3 relative z-100">
          <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mobile hamburger */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Open sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              {/* Date range calendar */}
              <DateRangeCalendar
                startDate={dateRange.start}
                endDate={dateRange.end}
                onChange={setDateRange}
                onDone={() => handleFetch(true)}
              />

              {/* Fetch button */}
              <Button
                onClick={() => handleFetch(true)}
                disabled={isFetching}
                size="default"
              >
                {isFetching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {isFetching ? 'Fetching...' : 'Refresh'}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <PublishButton
                getHTML={getHTML}
                disabled={selectedCount === 0}
                onDeleteSchedule={handleDeleteSchedule}
                getSnapshotData={getSnapshotData}
                onRestoreSchedule={handleRestoreSchedule}
                hasCurrentSelections={selectedCount > 0}
              />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 sm:gap-3 mt-3 flex-wrap">
            {/* Search */}
            <div className="w-full sm:w-64">
              <SearchField
                events={events}
                onFilteredChange={setSearchFilterIds}
              />
            </div>

            <Separator orientation="vertical" className="h-5 hidden sm:block" />

            <span className="text-xs text-muted-foreground">
              {selectedCount}/{totalCount} selected · {selectedLeagues} leagues
            </span>

            <Separator orientation="vertical" className="h-5 hidden sm:block" />

            <Button variant="ghost" size="xs" onClick={selectAll}>
              <CheckSquare className="w-3.5 h-3.5" /> Select All
            </Button>
            <Button variant="ghost" size="xs" onClick={deselectAll}>
              <Square className="w-3.5 h-3.5" /> Deselect
            </Button>

            <Separator orientation="vertical" className="h-5 hidden sm:block" />

            {/* Bulk tag */}
            <div className="relative">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setBulkTagOpen(!bulkTagOpen)}
                className={cn(bulkTagOpen && 'bg-accent')}
              >
                <Tag className="w-3.5 h-3.5" /> Bulk Tag
              </Button>
              {bulkTagOpen && (
                <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-20 p-3 min-w-57.5">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                      Tag selected matches
                    </span>
                    <button
                      onClick={() => setBulkTagOpen(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_SCREEN_TAGS.map((tag) => {
                      const isActive = activeBulkTags.has(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => handleBulkTag(tag)}
                          className={cn(
                            'text-xs px-2.5 py-1 rounded-full border transition-all',
                            isActive
                              ? 'bg-primary/15 border-primary/50 text-primary'
                              : 'bg-transparent border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground'
                          )}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  {selectedCount === 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2 text-center">
                      Select matches first to tag them
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator orientation="vertical" className="h-5 hidden sm:block" />

            <Button variant="secondary" size="xs" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Custom Event
            </Button>
          </div>
        </header>

        {/* Match list */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-4">
          {events.length === 0 && !isFetching && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-6xl mb-4">🏟️</div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                No matches loaded
              </h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                Sports data is loading automatically. If nothing appears, check your date range and try refreshing.
              </p>
              <Button onClick={() => handleFetch(true)}>
                <Loader2 className="w-4 h-4" />
                Fetch Matches
              </Button>
            </div>
          )}

          {isFetching && events.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Loading sports events...</p>
            </div>
          )}

          {filteredEvents.length === 0 && events.length > 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm text-muted-foreground">
                No matches found matching your search or filter.
              </p>
            </div>
          )}

          {Array.from(groupedByLeague.entries()).length === 0 ? null : Array.from(groupedByLeague.entries()).map(([sportId, leagueEvents]) => (
            <LeagueSection
              key={`${sportId}-${flashKey}`}
              sportId={sportId}
              events={leagueEvents}
              isLoading={fetchStatuses[sportId]?.loading}
              error={fetchStatuses[sportId]?.error}
              onToggleSelected={toggleSelected}
              onToggleFeatured={toggleFeatured}
              onToggleTag={toggleTag}
              isFeaturedLeague={featuredLeagues.has(sportId)}
              onToggleFeaturedLeague={toggleFeaturedLeague}
              onBulkSelectLeague={bulkSelectLeague}
            />
          ))}
        </div>
      </main>

      {/* ── Preview panel (custom resizable, no overlay) ────────────────────── */}
      {selectedCount > 0 && (
        <button
          ref={toggleBtnRef}
          onClick={() => { setPreviewOpen((o) => !o); setDeleteAllConfirm(false); }}
          title={previewOpen ? 'Close preview' : 'Open preview'}
          style={{ right: previewOpen ? panelWidth : 0 }}
          className={cn(
            "fixed z-99 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center bg-secondary border border-border border-r-0 rounded-l-md px-1 py-3 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            // On mobile, hide when preview open (panel is full-width, button would clip off-screen)
            previewOpen && "max-md:hidden"
          )}
        >
          {previewOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          top: headerHeight,
          transform: `translateX(${previewOpen ? 0 : panelWidth}px)`,
          transition: 'transform 150ms ease-in-out',
          willChange: 'transform',
        }}
        className="fixed bottom-0 right-0 bg-background border-l border-border z-50 flex flex-col overflow-hidden"
      >
        {/* Resize handle */}
        <div
          onPointerDown={startResize}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/20 transition-colors"
        />
        {/* Panel header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Schedule Preview</h3>
          <button
            onClick={() => setPreviewOpen(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-column body (stacks on narrow panels) */}
        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">

          {/* Left: match list */}
          <aside className="w-full sm:w-60 shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-sidebar flex flex-col overflow-hidden relative max-h-[40vh] sm:max-h-none">
            <div className="shrink-0 px-3 py-2 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span><strong className="text-foreground">{selectedCount}</strong> matches</span>
                  <span><strong className="text-foreground">{selectedLeagues}</strong> leagues</span>
                </div>
                <div className="flex items-center gap-1">
                  {previewCheckedIds.size > 0 && (
                    <Button variant="destructive" size="xs" onClick={handlePreviewDelete}>
                      <Trash2 className="w-3 h-3" /> Remove {previewCheckedIds.size}
                    </Button>
                  )}
                  {deleteAllConfirm ? null : (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setDeleteAllConfirm(true)}
                      className="text-destructive/50 hover:text-destructive hover:bg-destructive/10"
                      title="Delete all selected matches"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div ref={sidebarScrollRef} className="flex-1 overflow-y-auto p-2 space-y-3">
              {selectedCount === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center pt-8">No matches selected</p>
              ) : (
                orderedSelectedByLeague.map(([sportId, matches], leagueIdx) => (
                  <div
                    key={sportId}
                    ref={(el) => { if (el) leagueItemRefs.current.set(sportId, el); else leagueItemRefs.current.delete(sportId); }}
                    className={cn(
                      'border rounded-lg p-2 transition-colors',
                      activeSortLeague === sportId
                        ? 'border-blue-500 ring-1 ring-blue-500/30 bg-blue-500/5'
                        : featuredLeagues.has(sportId)
                          ? 'border-yellow-500/40 bg-yellow-500/5'
                          : 'border-border/50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate pr-1">
                        {matches[0]?.leagueLabel ?? sportId}
                        {featuredLeagues.has(sportId) && <span className="ml-1 text-yellow-400">★</span>}
                      </p>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => moveLeague(sportId, -1)}
                          disabled={leagueIdx === 0}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => moveLeague(sportId, 1)}
                          disabled={leagueIdx === orderedSelectedByLeague.length - 1}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {matches.map((m) => {
                        const checked = previewCheckedIds.has(m.id);
                        return (
                          <div
                            key={m.id}
                            onClick={() => togglePreviewCheck(m.id)}
                            className={cn(
                            'group flex items-start gap-1.5 text-[10px] rounded-md px-1.5 py-1 leading-snug cursor-pointer select-none transition-all border',
                              checked
                                ? 'bg-destructive/10 border-destructive/40'
                                : 'bg-secondary/40 border-transparent hover:bg-secondary/70'
                            )}
                          >
                            <div className={cn(
                              'mt-0.5 w-3 h-3 shrink-0 rounded-sm border flex items-center justify-center transition-all',
                              checked ? 'bg-destructive border-destructive' : 'border-border'
                            )}>
                              {checked && <X className="w-1.5 h-1.5 text-white" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate text-foreground">
                                {m.home}{m.away ? ' vs ' : ''}{m.away}
                              </div>
                              <div className="text-muted-foreground mt-0.5">
                                {formatDisplayDate(m.date)} · {m.time}
                                {m.isFeatured && <span className="ml-1 text-yellow-400">⭐</span>}
                                {m.tags.length > 0 && (
                                  <span className="ml-1 text-primary/70">{m.tags.join(', ')}</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingEvent(m); }}
                              className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-primary/10"
                              title="Edit match"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Delete All confirmation lightbox — covers only this sidebar */}
            {deleteAllConfirm && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/88 backdrop-blur-sm">
                <div className="bg-card border border-border rounded-xl p-5 shadow-2xl mx-4 text-center w-full max-w-55">
                  <Trash2 className="w-5 h-5 text-destructive mx-auto mb-2" />
                  <p className="text-sm font-semibold mb-0.5">Remove all?</p>
                  <p className="text-xs text-muted-foreground mb-4">Deselects all {selectedCount} matches.</p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="ghost" size="sm" onClick={() => setDeleteAllConfirm(false)}>Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleDeleteAll}>Delete All</Button>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Right: HTML preview */}
          <div ref={htmlPreviewRef} className="flex-1 overflow-y-auto" onPointerDown={() => setActiveSortLeague(null)}>
            <div className="p-3 sm:p-6">
              <PreviewPanel
                html={html}
                matchCount={selectedCount}
                leagueCount={selectedLeagues}
                onCopy={handleCopyHTML}
                copied={copied}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Add match modal */}
      <AddMatchModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={async (event) => {
          addEvents([event]);
          // Persist to Supabase so it survives page refreshes (expires in 2 weeks)
          await fetch('/api/custom-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          }).catch(() => {});
        }}
      />

      {/* Settings lightbox */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Edit match modal */}
      <EditMatchModal
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={(id, updates) => updateEvent(id, updates)}
      />
    </div>
  );
}
