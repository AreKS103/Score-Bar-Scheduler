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
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Menu,
  Pencil,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useScheduleStore } from '@/lib/store';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useFavoritesStore } from '@/lib/favoritesStore';
import { getCachedEvents, setCachedEvents, appendCachedEvent, removeCachedEvent, saveLocalCustomEvent, loadLocalCustomEvents, removeLocalCustomEvent, syncLocalCustomEventsToSupabase, saveSelectionToSupabase, loadSelectionFromSupabase, loadSelectionState, saveSelectionState, loadCustomLeagueLogo, type SavedSelectionState } from '@/lib/clientCache';
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
import UserProfileMenu from '@/components/UserProfileMenu';
import BusinessInfoModal from '@/components/BusinessInfoModal';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface ScheduleHistoryState {
  events: MatchEvent[];
  leagueOrder: string[];
  featuredLeagues: Array<[string, string]>;
  signature: string;
}

function cloneEventsForHistory(events: MatchEvent[]): MatchEvent[] {
  return events.map((e) => ({
    ...e,
    tags: [...e.tags],
  }));
}

function areEventsSameForHistory(a: MatchEvent[], b: MatchEvent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.sportId !== y.sportId ||
      x.date !== y.date ||
      x.time !== y.time ||
      x.home !== y.home ||
      x.away !== y.away ||
      x.round !== y.round ||
      x.isSelected !== y.isSelected ||
      x.isFeatured !== y.isFeatured
    ) {
      return false;
    }
    if (x.tags.length !== y.tags.length) return false;
    for (let j = 0; j < x.tags.length; j += 1) {
      if (x.tags[j] !== y.tags[j]) return false;
    }
  }
  return true;
}

function areFeaturedLeaguesSame(
  a: Array<[string, string]>,
  b: Array<[string, string]>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

function isAppendOnlyLeagueOrder(
  previous: string[],
  current: string[],
  events: MatchEvent[]
): boolean {
  if (current.length <= previous.length) return false;
  for (let i = 0; i < previous.length; i += 1) {
    if (previous[i] !== current[i]) return false;
  }

  const selectedLeagueIds = new Set(
    events.filter((e) => e.isSelected).map((e) => e.sportId)
  );
  const appended = current.slice(previous.length);
  return appended.length > 0 && appended.every((id) => selectedLeagueIds.has(id));
}

function buildHistorySignature(
  events: MatchEvent[],
  leagueOrder: string[],
  featuredLeagues: Map<string, string>
): string {
  const eventSig = events
    .map((e) => [
      e.id,
      e.sportId,
      e.date,
      e.time,
      e.home,
      e.away,
      e.round,
      e.tags.join(','),
      e.isSelected ? '1' : '0',
      e.isFeatured ? '1' : '0',
    ].join('~'))
    .join('|');

  const orderSig = leagueOrder.join('|');
  const featureSig = Array.from(featuredLeagues.entries())
    .map(([id, label]) => `${id}:${label}`)
    .join('|');

  return `${eventSig}@@${orderSig}@@${featureSig}`;
}

export default function SchedulePage() {
  const {
    events,
    fetchStatuses,
    dateRange,
    activeSportFilter,
    setEvents,
    addEvents,
    removeEvent,
    toggleSelected,
    toggleFeatured,
    toggleTag,
    updateEvent,
    selectAll,
    deselectAll,
    batchSetSelected,
    setFetchStatuses,
    setDateRange,
    setActiveSportFilter,
  } = useScheduleStore();

  const [scrollToMatch, setScrollToMatch] = useState<{ id: string; ts: number } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MatchEvent | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isRestoringSchedule, setIsRestoringSchedule] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [searchFilterIds, setSearchFilterIds] = useState<Set<string> | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewCheckedIds, setPreviewCheckedIds] = useState<Set<string>>(new Set());
  const [leagueOrder, setLeagueOrder] = useState<string[]>([]);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [panelWidth, setPanelWidth] = useState(700);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [businessInfoOpen, setBusinessInfoOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string | null>(null);
  const [featuredLeagues, setFeaturedLeagues] = useState<Map<string, string>>(new Map());
  const [highlightMenu, setHighlightMenu] = useState<
    | {
        type: 'league';
        sportId: string;
        leagueLabel: string;
        x: number;
        y: number;
      }
    | {
        type: 'match';
        eventId: string;
        sportId: string;
        leagueLabel: string;
        x: number;
        y: number;
      }
    | null
  >(null);
  const handleToggleSelected = useCallback(
    (id: string) => {
      const match = useScheduleStore.getState().events.find(e => e.id === id);
      toggleSelected(id);
      if (match && !match.isSelected) {
        setScrollToMatch({ id, ts: Date.now() });
      }
    },
    [toggleSelected]
  );

  const [flashKey, setFlashKey] = useState(0);
  const [embedInstances, setEmbedInstances] = useState<{ display_id: string; embed_id: string | null }[]>([]);
  const [publishTarget, setPublishTarget] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [noPluginBanner, setNoPluginBanner] = useState(false);
  const noPluginTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Derived embed selection key ─────────────────────────────────────────
  // Always resolve to the first embed if publishTarget is empty.
  const effectiveTarget = useMemo(() => {
    if (publishTarget) return publishTarget;
    if (embedInstances.length > 0) {
      return embedInstances[0].embed_id ?? embedInstances[0].display_id;
    }
    return '';
  }, [publishTarget, embedInstances]);
  const effectiveTargetRef = useRef(effectiveTarget);
  effectiveTargetRef.current = effectiveTarget;
  const [publishedSnapshot, setPublishedSnapshot] = useState<{
    events: MatchEvent[];
    leagueOrder: string[];
    featuredLeagues: Map<string, string>;
    html: string;
    label: string;
  } | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const router = useRouter();

  // ─── Fetch embed instances — auto-select first on initial load ──────────
  const didAutoSelectEmbed = useRef(false);
  useEffect(() => {
    const load = () =>
      fetch('/api/embed-instances')
        .then((r) => r.json())
        .then((d) => {
          const instances: { display_id: string; embed_id: string | null }[] = d.instances ?? [];
          setEmbedInstances(instances);
          // Auto-select first embed on first load (no "All" option).
          if (!didAutoSelectEmbed.current && instances.length > 0) {
            didAutoSelectEmbed.current = true;
            setPublishTarget(instances[0].embed_id ?? instances[0].display_id);
          }
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, []);

  // ─── Rename embed instance ─────────────────────────────────────────────────
  async function commitRename(oldId: string) {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === oldId) return;
    try {
      const r = await fetch('/api/embed-instances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedId: oldId, newName: trimmed }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error ?? 'Rename failed'); return; }
      setEmbedInstances(prev => prev.map(i =>
        (i.embed_id ?? i.display_id) === oldId
          ? { ...i, embed_id: trimmed, display_id: trimmed }
          : i
      ));
      if (publishTarget === oldId) setPublishTarget(trimmed);
    } catch { /* ignore */ }
  }

  // ─── Reload selections when switching embeds ──────────────────────────────
  // Each embed has its own independent set of selected matches, league order,
  // and featured leagues. Switching the active pill loads that embed's saved state
  // and clears any selections from the previous embed.
  const isInitialEmbedRef = useRef(true);
  useEffect(() => {
    // Skip when embedInstances haven't loaded yet (effectiveTarget is still '')
    if (!effectiveTarget) return;

    if (isInitialEmbedRef.current) {
      isInitialEmbedRef.current = false;
      // The auto-fetch effect ran before embedInstances loaded, so it used '' as
      // the selection key instead of the real embed ID. Re-apply the correct
      // embed's saved state now that we know the actual effectiveTarget.
      const target = effectiveTarget;
      let initCancelled = false;
      const applyInitial = async () => {
        // Wait for Supabase (which already merges localStorage as fallback) so we
        // only call setEvents once with the authoritative state — no stale flash.
        const bestState = await loadSelectionFromSupabase(target);
        if (initCancelled) return;
        // If the snapshot effect already applied the published state, defer to it.
        if (snapshotAppliedForTargetRef.current === target) return;
        const stateToApply = bestState ?? loadSelectionState(target);
        if (!stateToApply || Object.keys(stateToApply.selections).length === 0) return;
        if (stateToApply.leagueOrder.length > 0) setLeagueOrder(stateToApply.leagueOrder);
        if (Object.keys(stateToApply.featuredLeagues).length > 0) {
          setFeaturedLeagues(new Map(Object.entries(stateToApply.featuredLeagues)));
        }
        const currentEvents = useScheduleStore.getState().events;
        if (currentEvents.length > 0) {
          isSwitchingEmbedRef.current = true;
          const merged = currentEvents.map(e => {
            const sel = stateToApply.selections[e.id];
            if (sel) return { ...e, ...sel };
            return e;
          });
          setEvents(merged);
        }
      };
      applyInitial();
      return () => { initCancelled = true; };
    }

    isSwitchingEmbedRef.current = true;
    const target = effectiveTarget;

    // Clear undo/redo stacks (they belong to the previous embed)
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastHistoryStateRef.current = null;
    setHistoryVersion(0);
    // Reset the snapshot-applied guard so Supabase can apply if this embed has no snapshot
    snapshotAppliedForTargetRef.current = '';

    // Reset in-memory events to their unselected base, then overlay the new embed's state
    let loadCancelled = false;
    const loadEmbedState = async () => {
      const savedState = loadSelectionState(target);
      const savedSel = savedState?.selections ?? {};

      // Deselect everything first
      const cleared = useScheduleStore.getState().events.map(e => ({
        ...e,
        isSelected: false,
        isFeatured: false,
        tags: [] as ScreenTag[],
      }));

      // Apply the new embed's saved selections (fast, synchronous from localStorage)
      const merged = cleared.map(e => {
        const sel = savedSel[e.id];
        if (sel) return { ...e, ...sel };
        return e;
      });
      setEvents(merged);

      // Restore league order + featured leagues for this embed
      if (savedState && savedState.leagueOrder.length > 0) {
        setLeagueOrder(savedState.leagueOrder);
      } else {
        setLeagueOrder([]);
      }
      if (savedState && Object.keys(savedState.featuredLeagues).length > 0) {
        setFeaturedLeagues(new Map(Object.entries(savedState.featuredLeagues)));
      } else {
        setFeaturedLeagues(new Map());
      }

      // Also check Supabase for a fresher copy (cross-device sync)
      const supaState = await loadSelectionFromSupabase(target);
      // Bail out if the embed switched while we were awaiting, or if the snapshot
      // effect already applied the published state (snapshot takes priority).
      if (loadCancelled) return;
      if (snapshotAppliedForTargetRef.current === target) return;
      const hasSelections =
        Object.keys(savedSel).length > 0 ||
        (supaState && Object.keys(supaState.selections).length > 0);

      if (supaState && Object.keys(supaState.selections).length > 0) {
        const currentEvents = useScheduleStore.getState().events;
        if (currentEvents.length > 0) {
          const reMerged = currentEvents.map(e => {
            const sel = supaState.selections[e.id];
            if (sel) return { ...e, ...sel };
            return e;
          });
          setEvents(reMerged);
        }
        if (supaState.leagueOrder.length > 0) setLeagueOrder(supaState.leagueOrder);
        if (Object.keys(supaState.featuredLeagues).length > 0) {
          setFeaturedLeagues(new Map(Object.entries(supaState.featuredLeagues)));
        }
      }

      // Fallback: if this embed has no saved selections at all, restore from the
      // last published snapshot so the user sees what was pushed rather than an
      // empty list. This covers the case where localStorage was cleared or the
      // user is on a new device and hasn't explicitly saved selections yet.
      if (!hasSelections && publishTarget) {
        try {
          const r = await fetch(`/api/schedule-history?target=${encodeURIComponent(publishTarget)}`);
          if (loadCancelled) return;
          const { schedule } = await r.json() as { schedule: { events_snapshot: MatchEvent[]; league_order: string[]; featured_leagues: Record<string, string> } | null };
          if (loadCancelled) return;
          if (schedule?.events_snapshot?.length) {
            const snapshotIds = new Set(schedule.events_snapshot.map((e: MatchEvent) => e.id));
            const currentEvents = useScheduleStore.getState().events;
            const restored = currentEvents.map(e => ({
              ...e,
              isSelected: snapshotIds.has(e.id),
            }));
            setEvents(restored);
            if (schedule.league_order?.length > 0) setLeagueOrder(schedule.league_order);
            if (schedule.featured_leagues && Object.keys(schedule.featured_leagues).length > 0) {
              setFeaturedLeagues(new Map(Object.entries(schedule.featured_leagues)));
            }
          }
        } catch {
          // Snapshot fetch failed — leave events in cleared state
        }
      }
    };

    loadEmbedState();
    // Cancel any in-flight async operations if the embed switches again before
    // they complete — prevents stale data from a previous embed overwriting state.
    return () => { loadCancelled = true; };
  }, [effectiveTarget, setEvents]);

  // ─── Fetch last published snapshot when a target pill is selected ─────────
  useEffect(() => {
    if (!publishTarget) {
      setPublishedSnapshot(null);
      return;
    }
    let snapshotCancelled = false;
    const load = (isInitial = false) => {
      setSnapshotLoading(true);
      fetch(`/api/schedule-history?target=${encodeURIComponent(publishTarget)}`)
        .then((r) => r.json())
        .then(({ schedule }: { schedule: { events_snapshot: MatchEvent[]; league_order: string[]; featured_leagues: Record<string, string>; week_label: string } | null }) => {
          if (snapshotCancelled) return;
          if (!schedule) { setPublishedSnapshot(null); return; }
          const evts = (schedule.events_snapshot ?? []) as MatchEvent[];
          const lo = (schedule.league_order ?? []) as string[];
          const fl = new Map(Object.entries((schedule.featured_leagues ?? {}) as Record<string, string>));
          setPublishedSnapshot({
            events: evts,
            leagueOrder: lo,
            featuredLeagues: fl,
            html: generateHTML(evts, lo, fl),
            label: schedule.week_label || publishTarget,
          });
          // ── Sync the editor (left panel) to match the published state ──────────────
          // On initial load for an embed pill, the editor should mirror the preview.
          // Background polls (isInitial=false) do NOT re-sync so in-progress edits
          // made since the last publish are preserved.
          if (isInitial && evts.length > 0) {
            isSwitchingEmbedRef.current = true;
            snapshotAppliedForTargetRef.current = publishTarget;
            const snapshotById = new Map(evts.map((e: MatchEvent) => [e.id, e]));
            const current = useScheduleStore.getState().events;
            const currentIds = new Set(current.map((e: MatchEvent) => e.id));
            // Apply snapshot selection/featured/tags state to currently loaded events
            const updated = current.map((e: MatchEvent) => {
              const snap = snapshotById.get(e.id);
              return {
                ...e,
                isSelected: snap ? !!(snap.isSelected) : false,
                isFeatured: snap ? !!(snap.isFeatured) : false,
                tags: snap ? (snap.tags ?? []) : [],
              };
            });
            // Include published events that fall outside the current date range
            const snapOnly = evts.filter((e: MatchEvent) => !currentIds.has(e.id));
            setEvents([...updated, ...snapOnly]);
            if (lo.length > 0) setLeagueOrder(lo);
            if (fl.size > 0) setFeaturedLeagues(fl);
          }
        })
        .catch(() => { if (!snapshotCancelled) setPublishedSnapshot(null); })
        .finally(() => { if (!snapshotCancelled) setSnapshotLoading(false); });
    };
    load(true);
    const id = setInterval(() => load(false), 120_000);
    return () => { snapshotCancelled = true; clearInterval(id); };
  }, [publishTarget]);

  // ─── Client-side auth guard ─────────────────────────────────────────────────
  // Redirect to /login if the Supabase session has expired or been revoked.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    // Check on mount and load user email
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) router.push('/login');
      else {
        setUserEmail(data.user?.email ?? null);
        // Load business info for sidebar header
        if (data.user?.id) {
          supabase
            .from('business_info')
            .select('business_name, logo_url')
            .eq('user_id', data.user.id)
            .single()
            .then(({ data: biz }) => {
              if (biz) {
                setBusinessName(biz.business_name ?? null);
                setBusinessLogoUrl(biz.logo_url ?? null);
              }
            });
        }
      }
    });
    // Listen for sign-out / token-refresh failures
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') router.push('/login');
      if (session?.user?.email) setUserEmail(session.user.email);
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
  const [headerHeight, setHeaderHeight] = useState(116);
  const hasFetchedRef = useRef(false);
  const prevPreviewContentCountRef = useRef(0);
  const isSwitchingEmbedRef = useRef(false);
  // Tracks which embed's snapshot has been applied to the editor, so that a  
  // concurrent Supabase fetch in loadEmbedState doesn't overwrite the snapshot.
  const snapshotAppliedForTargetRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const widthRef = useRef(700);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const leagueItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const htmlPreviewRef = useRef<HTMLDivElement>(null);
  const highlightMenuRef = useRef<HTMLDivElement>(null);
  const undoStackRef = useRef<ScheduleHistoryState[]>([]);
  const redoStackRef = useRef<ScheduleHistoryState[]>([]);
  const lastHistoryStateRef = useRef<ScheduleHistoryState | null>(null);
  const isApplyingHistoryRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  // Ref mirror of selectedByLeague so moveLeague never closes over stale data
  const selectedByLeagueRef = useRef<Map<string, MatchEvent[]>>(new Map());

  const captureHistoryState = useCallback((): ScheduleHistoryState => ({
    events: cloneEventsForHistory(events),
    leagueOrder: [...leagueOrder],
    featuredLeagues: Array.from(featuredLeagues.entries()),
    signature: buildHistorySignature(events, leagueOrder, featuredLeagues),
  }), [events, leagueOrder, featuredLeagues]);

  const applyHistoryState = useCallback((state: ScheduleHistoryState) => {
    isApplyingHistoryRef.current = true;
    setEvents(cloneEventsForHistory(state.events));
    setLeagueOrder(state.leagueOrder);
    setFeaturedLeagues(new Map(state.featuredLeagues));
    setHistoryVersion((v) => v + 1);
  }, [setEvents]);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;

    const current = captureHistoryState();
    redoStackRef.current.push(current);
    applyHistoryState(previous);
  }, [applyHistoryState, captureHistoryState]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;

    const current = captureHistoryState();
    undoStackRef.current.push(current);
    applyHistoryState(next);
  }, [applyHistoryState, captureHistoryState]);

  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0;
  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z';
      if (!isUndoShortcut) return;

      const isRedoShortcut = event.shiftKey;
      event.preventDefault();
      if (isRedoShortcut) {
        redo();
        return;
      }
      undo();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  // ─── Fetch all sports data via Server API (cached) ───────────────────────────
  // IMPORTANT: Read dateRange directly from the store at call time so that
  // `onDone={() => handleFetch(true)}` always uses the freshly-selected range
  // even though the callback was created on the previous render (stale closure).
  const handleFetch = useCallback(async (forceRefresh = false) => {
    // Read the CURRENT range from the store – this is always fresh regardless
    // of when this callback was created.
    const currentRange = useScheduleStore.getState().dateRange;

    // Try to load from client cache first for instant display
    if (!forceRefresh && events.length === 0) {
      const cached = getCachedEvents(currentRange);
      if (cached && cached.length > 0) {
        console.log(`[Schedule] Instant load: ${cached.length} events from local cache`);
        const instantSavedSel = loadSelectionState(effectiveTargetRef.current)?.selections ?? {};
        const mergedCached = cached.map(e => {
          const saved = instantSavedSel[e.id];
          if (saved) return { ...e, ...saved };
          return e;
        });
        setEvents(mergedCached);
        // Still fetch fresh data in background
      }
    }

    setIsFetching(true);
    setFetchStatuses(
      Object.fromEntries(
        SPORTS_CONFIG.map((s) => [s.id, { loading: true, error: null }])
      )
    );

    try {
      const url = `/api/events?start=${currentRange.start}&end=${currentRange.end}`;
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
      
      // Merge local fallback custom events to survive Supabase custom_events issues
      const localCustom = loadLocalCustomEvents(currentRange);
      const mergedRawById = new Map<string, MatchEvent>();
      for (const e of allEventsRaw) mergedRawById.set(e.id, e);
      for (const e of localCustom) {
        if (!mergedRawById.has(e.id)) mergedRawById.set(e.id, e);
      }
      const mergedRaw = Array.from(mergedRawById.values());

      // Merge with preserved selections (in-memory > localStorage > default)
      const savedSel = loadSelectionState(effectiveTargetRef.current)?.selections ?? {};
      const allEvents = mergedRaw.map((e: MatchEvent) => {
        const mem = memSel.get(e.id);
        if (mem && (mem.isSelected || mem.isFeatured || mem.tags.length > 0)) return { ...e, ...mem };
        const saved = savedSel[e.id];
        if (saved) return { ...e, ...saved };
        return e;
      });

      setEvents(allEvents);
      setCachedEvents(currentRange, mergedRaw);
      
      setFetchStatuses(
        Object.fromEntries(
          SPORTS_CONFIG.map((s) => [s.id, { loading: false, error: null }])
        )
      );

      if (data.cached) {
        console.log(`[Schedule] Loaded ${allEvents.length} events from ${currentRange.start} to ${currentRange.end} (server cached, age: ${data.age}s${data.stale ? ', stale' : ''})`);
      } else {
        console.log(`[Schedule] Loaded ${allEvents.length} events from ${currentRange.start} to ${currentRange.end} (fresh)`);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      setFetchStatuses(
        Object.fromEntries(
          SPORTS_CONFIG.map((s) => [s.id, { loading: false, error: 'Fetch failed' }])
        )
      );
    } finally {
      setIsFetching(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, setEvents, setFetchStatuses]);

  // ─── Auto-fetch on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      // Restore league order + featured leagues from localStorage first (instant)
      const saved = loadSelectionState(effectiveTargetRef.current);
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
      // Retry syncing any locally stored custom events to Supabase (best-effort).
      syncLocalCustomEventsToSupabase()
        .then(({ synced, failed }) => {
          if (synced > 0 || failed > 0) {
            console.log(`[CustomEvents] local->Supabase sync: synced=${synced}, failed=${failed}`);
          }
        })
        .catch(() => {});
      // NOTE: Supabase selection sync is handled by the isInitialEmbedRef effect
      // which fires when embedInstances load and fires with the correct embed key.
    }
  }, [handleFetch, setEvents]);

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

  const featuredOnlyLeagues = useMemo(() => {
    const selectedLeagueIds = new Set(Array.from(selectedByLeague.keys()));
    const entries: { sportId: string; leagueLabel: string }[] = [];

    for (const [sportId, customLabel] of featuredLeagues.entries()) {
      if (selectedLeagueIds.has(sportId)) continue;
      const configLabel = SPORTS_CONFIG.find((s) => s.id === sportId)?.label ?? sportId;
      entries.push({ sportId, leagueLabel: customLabel || configLabel });
    }

    entries.sort((a, b) => {
      const aIdx = leagueOrder.indexOf(a.sportId);
      const bIdx = leagueOrder.indexOf(b.sportId);
      if (aIdx !== -1 || bIdx !== -1) {
        const normA = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
        const normB = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
        return normA - normB;
      }
      return a.leagueLabel.localeCompare(b.leagueLabel);
    });

    return entries;
  }, [selectedByLeague, featuredLeagues, leagueOrder]);

  const previewContentCount = selectedCount + featuredOnlyLeagues.length;

  // ─── History tracking for undo/redo ───────────────────────────────────────
  useEffect(() => {
    const current = captureHistoryState();

    if (!lastHistoryStateRef.current) {
      lastHistoryStateRef.current = current;
      return;
    }

    const previous = lastHistoryStateRef.current;
    const changed = previous.signature !== current.signature;
    if (!changed) return;

    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false;
      lastHistoryStateRef.current = current;
      return;
    }

    // Ignore derived league-order appends (caused by selection sync) so the first
    // undo reverts the actual user action instead of a bookkeeping step.
    if (
      areEventsSameForHistory(previous.events, current.events) &&
      areFeaturedLeaguesSame(previous.featuredLeagues, current.featuredLeagues) &&
      isAppendOnlyLeagueOrder(previous.leagueOrder, current.leagueOrder, current.events)
    ) {
      lastHistoryStateRef.current = current;
      return;
    }

    undoStackRef.current.push(previous);
    if (undoStackRef.current.length > 80) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    lastHistoryStateRef.current = current;
    setHistoryVersion((v) => v + 1);
  }, [captureHistoryState]);

  // Auto-clear stale league spotlights when that league has no events
  // in the currently loaded date range (e.g. F1 week with no races).
  useEffect(() => {
    if (events.length === 0) {
      setFeaturedLeagues((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }

    const availableLeagueIds = new Set(events.map((e) => e.sportId));
    setFeaturedLeagues((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map<string, string>();
      for (const [sportId, label] of prev.entries()) {
        if (availableLeagueIds.has(sportId)) {
          next.set(sportId, label);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [events]);

  // Keep leagueOrder in sync: preserve user's order history and append new leagues.
  // Do not drop unselected leagues so undo/redo can restore exact prior positions.
  useEffect(() => {
    setLeagueOrder((prev) => {
      const keys = Array.from(selectedByLeague.keys());
      const added = keys.filter((k) => !prev.includes(k));
      return added.length ? [...prev, ...added] : prev;
    });
  }, [selectedByLeague]);

  // ─── Auto-save selection state (debounced 800ms) ──────────────────────────
  // Persists selections, tags, league order, and featured leagues to localStorage
  // so they survive page refreshes. Skips while fetching to avoid overwriting
  // saved state with intermediate (unmerged) event data.
  useEffect(() => {
    if (events.length === 0 || isFetching) return;
    // Don't save selections while the embed target is still unknown (embedInstances
    // haven't loaded yet). Saving to '' would contaminate the global slot and could
    // bleed into other embeds when they fallback-load from that slot.
    if (!effectiveTargetRef.current && embedInstances.length === 0) return;
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
      }, effectiveTargetRef.current);
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [events, leagueOrder, featuredLeagues, isFetching, embedInstances]);

  // ─── Flush selection state on page unload (prevents losing recent changes) ─
  // The debounced save above may not fire if the user refreshes within 800ms.
  // This ensures the latest state is persisted synchronously before the page dies.
  useEffect(() => {
    const flush = () => {
      if (events.length === 0) return;
      const selections: SavedSelectionState['selections'] = {};
      for (const e of events) {
        if (e.isSelected || e.isFeatured || e.tags.length > 0) {
          selections[e.id] = { isSelected: e.isSelected, isFeatured: e.isFeatured, tags: e.tags };
        }
      }
      saveSelectionState({
        selections,
        leagueOrder,
        featuredLeagues: Object.fromEntries(featuredLeagues),
        savedAt: Date.now(),
      }, effectiveTargetRef.current);
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [events, leagueOrder, featuredLeagues]);

  // ─── Auto-show panel on first preview item; auto-hide when none ──────────
  useEffect(() => {
    if (previewContentCount > prevPreviewContentCountRef.current) {
      setPreviewOpen(true);
    }
    // Only auto-close when the user deliberately removed all items, not during
    // an embed switch (which transiently drops the count to 0 while loading)
    if (previewContentCount === 0 && !isSwitchingEmbedRef.current) {
      setPreviewOpen(false);
      setPreviewCheckedIds(new Set());
      setDeleteAllConfirm(false);
    }
    isSwitchingEmbedRef.current = false;
    prevPreviewContentCountRef.current = previewContentCount;
  }, [previewContentCount]);

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

  // All events the user has starred — shown in the highlights section at the
  // top of the left preview panel (mirrors the "This Week's Highlights" block
  // in the published HTML output).
  const featuredMatches = useMemo(
    () => events
      .filter((e) => e.isFeatured)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [events]
  );

  // NOTE: main schedule list uses natural groupedByLeague order (unchanged by panel reordering)

  const moveLeague = useCallback((league: string, dir: -1 | 1) => {
    setActiveSortLeague(league);
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

  const openHighlightMenu = useCallback((payload:
    | {
        type: 'league';
        sportId: string;
        leagueLabel: string;
        x: number;
        y: number;
      }
    | {
        type: 'match';
        eventId: string;
        sportId: string;
        leagueLabel: string;
        x: number;
        y: number;
      }
  ) => {
    setHighlightMenu(payload);
  }, []);

  const closeHighlightMenu = useCallback(() => {
    setHighlightMenu(null);
  }, []);

  const setLeagueHighlight = useCallback((sportId: string, leagueLabel: string, shouldHighlight: boolean) => {
    setFeaturedLeagues((prev) => {
      const next = new Map(prev);
      if (shouldHighlight) {
        const configLabel = SPORTS_CONFIG.find((s) => s.id === sportId)?.label ?? '';
        next.set(sportId, leagueLabel || configLabel);
      } else {
        next.delete(sportId);
      }
      return next;
    });
    closeHighlightMenu();
  }, [closeHighlightMenu]);

  const setMatchHighlight = useCallback((eventId: string, shouldHighlight: boolean) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) {
      closeHighlightMenu();
      return;
    }
    if (Boolean(event.isFeatured) !== shouldHighlight) {
      toggleFeatured(eventId);
    }
    closeHighlightMenu();
  }, [events, toggleFeatured, closeHighlightMenu]);

  useEffect(() => {
    if (!highlightMenu) return;

    const handleGlobalPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (highlightMenuRef.current?.contains(target)) return;
      closeHighlightMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHighlightMenu();
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [highlightMenu, closeHighlightMenu]);

  const bulkSelectLeague = useCallback((sportId: string, selectAll: boolean) => {
    const ids = useScheduleStore.getState().events.filter((e) => e.sportId === sportId).map((e) => e.id);
    batchSetSelected(ids, selectAll);
  }, [batchSetSelected]);

  const handleDeleteSchedule = useCallback(async () => {
    // Pass the current embedTarget so the API deletes the correct schedule row.
    // publishTarget === '' means the global (NULL) target.
    await fetch('/api/delete-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embedTarget: publishTarget || null }),
    });
    // Clear the local preview snapshot so the UI reflects the deletion immediately.
    setPublishedSnapshot(null);
  }, [publishTarget]);

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
    setScrollToMatch({ id, ts: Date.now() });
  }, []);

  const deleteManualEventsPermanently = useCallback(async (ids: string[]) => {
    const eventIds = Array.from(new Set(ids));
    if (eventIds.length === 0) return { deletedIds: [] as string[], failedIds: [] as string[] };

    try {
      const res = await fetch('/api/custom-events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds }),
      });

      if (!res.ok) {
        console.error('[CustomEvents] permanent delete failed', { status: res.status, eventIds });
        return { deletedIds: [] as string[], failedIds: eventIds };
      }

      const data = await res.json().catch(() => null) as { deletedEventIds?: string[] } | null;
      const deletedSet = new Set(
        Array.isArray(data?.deletedEventIds)
          ? data!.deletedEventIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
          : eventIds
      );
      const deletedIds = eventIds.filter((id) => deletedSet.has(id));
      const failedIds = eventIds.filter((id) => !deletedSet.has(id));

      for (const id of deletedIds) {
        removeEvent(id);
        removeLocalCustomEvent(id);
        removeCachedEvent(id);
      }

      return { deletedIds, failedIds };
    } catch (error) {
      console.error('[CustomEvents] permanent delete request threw', { error, eventIds });
      return { deletedIds: [] as string[], failedIds: eventIds };
    }
  }, [removeEvent]);

  const handlePreviewDelete = useCallback(async () => {
    const checkedIds = Array.from(previewCheckedIds);
    if (checkedIds.length === 0) return;

    const checkedEvents = events.filter((e) => checkedIds.includes(e.id));
    const manualIds = checkedEvents.filter((e) => e.source === 'manual').map((e) => e.id);
    const nonManualIds = checkedEvents.filter((e) => e.source !== 'manual').map((e) => e.id);

    // Non-manual items are deselected only.
    if (nonManualIds.length > 0) {
      batchSetSelected(nonManualIds, false);
    }

    // Manual/custom items are removed locally only after Supabase confirms delete.
    let failedManualIds: string[] = [];
    if (manualIds.length > 0) {
      const result = await deleteManualEventsPermanently(manualIds);
      failedManualIds = result.failedIds;
    }

    setPreviewCheckedIds(new Set(failedManualIds));
  }, [previewCheckedIds, events, batchSetSelected, deleteManualEventsPermanently]);

  const handleDeleteAll = useCallback(async () => {
    const selectedEvents = events.filter((e) => e.isSelected);
    const manualIds = selectedEvents.filter((e) => e.source === 'manual').map((e) => e.id);
    const nonManualIds = selectedEvents.filter((e) => e.source !== 'manual').map((e) => e.id);

    if (nonManualIds.length > 0) {
      batchSetSelected(nonManualIds, false);
    }

    let failedManualIds: string[] = [];
    if (manualIds.length > 0) {
      const result = await deleteManualEventsPermanently(manualIds);
      failedManualIds = result.failedIds;
    }

    setDeleteAllConfirm(false);
    setPreviewCheckedIds(new Set(failedManualIds));
  }, [events, batchSetSelected, deleteManualEventsPermanently]);

  // ─── HTML generation — recomputes whenever leagueOrder, events, or sortVersion changes ─
  const html = useMemo(
    () => (selectedCount > 0 || featuredLeagues.size > 0)
      ? generateHTML(events, leagueOrder, featuredLeagues)
      : '',
    [events, leagueOrder, selectedCount, featuredLeagues]
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

  const handleRestoreSchedule = useCallback(async (scheduleId: string, embedTarget?: string | null) => {
    // If the schedule belongs to a different embed, switch to that embed pill first
    // so the restored selections are associated with the correct target.
    if (embedTarget && embedTarget !== publishTarget) {
      setPublishTarget(embedTarget);
      // Brief yield so the embed-switch effect runs and clears current selections
      // before we overwrite them with the restored snapshot.
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    setIsRestoringSchedule(true);
    try {
      const normalizeEvent = (e: MatchEvent): MatchEvent => {
        const fallbackLogo = e.source === 'manual' ? loadCustomLeagueLogo(e.leagueLabel ?? '') : '';
        return {
          ...e,
          away: e.away ?? '',
          round: e.round ?? '',
          leagueLogo: e.leagueLogo || fallbackLogo || '',
          tags: Array.isArray(e.tags) ? e.tags : [],
          isFeatured: Boolean(e.isFeatured),
          isSelected: Boolean(e.isSelected),
        };
      };

      const res = await fetch(`/api/schedule-history/${scheduleId}`);
      if (!res.ok) return;
      const { schedule } = await res.json();
      if (!schedule) return;

      const rangeStart: string = schedule.date_range_start || dateRange.start;
      const rangeEnd: string = schedule.date_range_end || dateRange.end;
      const snapshot: MatchEvent[] = Array.isArray(schedule.events_snapshot)
        ? (schedule.events_snapshot as MatchEvent[]).map(normalizeEvent)
        : [];
      const restoredCustom = snapshot.filter((e) => e.source === 'manual');

      // Start fetching full-week events immediately while local persistence runs.
      const eventsPromise = fetch(`/api/events?start=${rangeStart}&end=${rangeEnd}`);

      // Persist restored custom events locally so they survive refresh/tab close.
      for (const ev of restoredCustom) {
        saveLocalCustomEvent(ev);
        appendCachedEvent(ev);
      }

      // Move calendar to the restored schedule range only if changed.
      if (rangeStart !== dateRange.start || rangeEnd !== dateRange.end) {
        setDateRange(rangeStart, rangeEnd);
      }

      // Always load the full week from API, then overlay restored selections.
      // This keeps the left panel complete while restoring preview selections.
      const eventsRes = await eventsPromise;
      const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };
      const apiEvents: MatchEvent[] = (eventsData.events ?? []).map(normalizeEvent);

      // Include local fallback custom events in the restored date range too.
      const localCustom = loadLocalCustomEvents({ start: rangeStart, end: rangeEnd }).map(normalizeEvent);

      const byId = new Map<string, MatchEvent>();
      for (const e of apiEvents) byId.set(e.id, e);
      for (const e of localCustom) {
        if (!byId.has(e.id)) byId.set(e.id, e);
      }

      // Overlay snapshot so selected/featured/tags (and custom-only rows) are restored.
      for (const snap of snapshot) {
        const existing = byId.get(snap.id);
        if (existing) {
          byId.set(snap.id, { ...existing, ...snap, isSelected: true });
        } else {
          byId.set(snap.id, { ...snap, isSelected: true });
        }
      }

      const restoredFullWeek = Array.from(byId.values());
      setEvents(restoredFullWeek);
      setCachedEvents({ start: rangeStart, end: rangeEnd }, restoredFullWeek);

      setLeagueOrder(schedule.league_order || []);
      const fl = new Map<string, string>(Object.entries(schedule.featured_leagues || {}));
      setFeaturedLeagues(fl);
      setPreviewOpen(true);

      // Persist restored selection state immediately for refresh durability.
      const selections: SavedSelectionState['selections'] = {};
      for (const e of restoredFullWeek) {
        if (e.isSelected || e.isFeatured || e.tags.length > 0) {
          selections[e.id] = { isSelected: e.isSelected, isFeatured: e.isFeatured, tags: e.tags };
        }
      }
      saveSelectionToSupabase({
        selections,
        leagueOrder: schedule.league_order || [],
        featuredLeagues: schedule.featured_leagues || {},
        savedAt: Date.now(),
      }, effectiveTargetRef.current);
    } catch (e) {
      console.error('Failed to restore schedule:', e);
    } finally {
      setIsRestoringSchedule(false);
    }
  }, [dateRange.end, dateRange.start, publishTarget, setDateRange, setEvents]);

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
          'w-64 shrink-0 border-r border-border bg-sidebar overflow-x-hidden',
          'flex flex-col',
          // Mobile: slide-out drawer
          'fixed inset-y-0 left-0 z-160 transition-transform duration-200 ease-in-out md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <Separator className="mx-3" />

          <div className="px-2 pt-2">
            <SportFilter
              activeFilter={activeSportFilter}
              onFilterChange={(f) => { setActiveSportFilter(f); setFlashKey(k => k + 1); setSidebarOpen(false); }}
              events={events}
              businessName={businessName}
              businessLogoUrl={businessLogoUrl}
            />
          </div>
        </div>

        {/* Pinned user profile at bottom */}
        <div className="shrink-0 border-t border-border px-2 py-1.5">
          <UserProfileMenu email={userEmail} onLogout={handleLogout} onBusinessInfo={() => setBusinessInfoOpen(true)} onSettings={() => setSettingsOpen(true)} businessLogoUrl={businessLogoUrl} />
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

            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={!canUndo}
                title="Undo last schedule change (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={!canRedo}
                title="Redo last undone change (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
              <PublishButton
                getHTML={getHTML}
                disabled={selectedCount === 0}
                onDeleteSchedule={handleDeleteSchedule}
                getSnapshotData={getSnapshotData}
                onRestoreSchedule={handleRestoreSchedule}
                hasCurrentSelections={selectedCount > 0}
                embedInstances={embedInstances}
                publishTarget={publishTarget}
                onSuccess={(ts) => {
                  // After publishing, check if any plugin embed is registered.
                  // Delay 1 s so Supabase registration from WordPress has time to land.
                  if (noPluginTimerRef.current) clearTimeout(noPluginTimerRef.current);
                  noPluginTimerRef.current = setTimeout(() => {
                    fetch('/api/embed-instances')
                      .then(r => r.json())
                      .then(d => {
                        if ((d.instances ?? []).length === 0) setNoPluginBanner(true);
                      })
                      .catch(() => {});
                  }, 1500);
                }}
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
        <div className="relative flex-1 overflow-y-auto px-3 sm:px-6 pb-4">
          {isFetching && events.length > 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[1px] pointer-events-none">
              <div className="flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-md">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading sports events...
              </div>
            </div>
          )}
          {events.length === 0 && !isFetching && hasFetchedRef.current && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-6xl mb-4">🏟️</div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                No matches loaded
              </h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                Sports data is loading automatically. If nothing appears, check your date range and try refreshing.
              </p>
              <Button onClick={() => handleFetch(true)}>
                <RefreshCw className="w-4 h-4" />
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
              onToggleSelected={handleToggleSelected}
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
      {(previewContentCount > 0 || previewOpen) && (
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
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-border">
          <h3 className="text-sm font-bold text-foreground shrink-0">Schedule Preview</h3>

          {/* Publish-to instance pills */}
          {embedInstances.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-[11px] text-muted-foreground shrink-0">Publish to:</span>
              {embedInstances.map((inst) => {
                const value = inst.embed_id ?? inst.display_id;
                const isRenaming = renamingId === value;
                return (
                  <div key={inst.display_id} className="inline-flex">
                    {isRenaming ? (
                      <input
                        autoFocus
                        className="text-[11px] px-2 py-0.5 rounded-full border border-primary bg-background text-foreground outline-none w-24"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(value);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={() => commitRename(value)}
                      />
                    ) : (
                      <button
                        onClick={() => setPublishTarget(value)}
                        onDoubleClick={() => { setRenamingId(value); setRenameValue(inst.display_id); }}
                        title="Double-click to rename"
                        className={cn(
                          'text-[11px] px-2 py-0.5 rounded-full border transition-all',
                          publishTarget === value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                        )}
                      >
                        {inst.display_id}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setPreviewOpen(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-column body (stacks on narrow panels) */}
        <div className="relative flex flex-col sm:flex-row flex-1 overflow-hidden">
          {isRestoringSchedule && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/75 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-lg">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading schedule...
              </div>
            </div>
          )}

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
              {selectedCount === 0 && featuredOnlyLeagues.length === 0 && featuredMatches.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center pt-8">No matches selected</p>
              ) : (
                <>
                {/* ─── Highlighted / starred matches ───────────────────── */}
                {featuredMatches.length > 0 && (
                  <div className="border border-yellow-500/40 bg-yellow-500/5 rounded-lg p-2">
                    <p className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide mb-1.5">
                      ⭐ Highlighted Matches
                    </p>
                    <div className="space-y-1">
                      {featuredMatches.map((m) => (
                        <div
                          key={m.id}
                          className="text-[10px] rounded-md px-1.5 py-1 bg-yellow-500/10 border border-yellow-500/20 cursor-pointer"
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openHighlightMenu({
                              type: 'match',
                              eventId: m.id,
                              sportId: m.sportId,
                              leagueLabel: m.leagueLabel ?? m.sportId,
                              x: event.clientX,
                              y: event.clientY,
                            });
                          }}
                        >
                          <div className="font-medium text-foreground truncate">
                            {m.home}{m.away ? ' vs ' : ''}{m.away}
                          </div>
                          <div className="text-muted-foreground mt-0.5">
                            {formatDisplayDate(m.date)} · {m.time}
                            <span className="ml-1 text-muted-foreground/60">{m.leagueLabel ?? m.sportId}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {featuredOnlyLeagues.map((league) => (
                  <div
                    key={`featured-only-${league.sportId}`}
                    className="border border-yellow-500/40 bg-yellow-500/5 rounded-lg p-2 transition-colors"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openHighlightMenu({
                        type: 'league',
                        sportId: league.sportId,
                        leagueLabel: league.leagueLabel,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  >
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate pr-1">
                      {league.leagueLabel}
                      <span className="ml-1 text-yellow-400">★</span>
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                    </p>
                  </div>
                ))}

                {orderedSelectedByLeague.map(([sportId, matches], leagueIdx) => (
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
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if ((event.target as HTMLElement).closest('[data-no-league-menu="true"]')) {
                        closeHighlightMenu();
                        return;
                      }
                      openHighlightMenu({
                        type: 'league',
                        sportId,
                        leagueLabel: matches[0]?.leagueLabel ?? sportId,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate pr-1">
                        {matches[0]?.leagueLabel ?? sportId}
                        {featuredLeagues.has(sportId) && <span className="ml-1 text-yellow-400">★</span>}
                      </p>
                      <div className="flex items-center gap-0.5 shrink-0" data-no-league-menu="true">
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
                            className={cn(
                            'group flex items-stretch text-[10px] rounded-md leading-snug select-none transition-all border overflow-hidden',
                              checked
                                ? 'bg-destructive/10 border-destructive/40'
                                : 'bg-secondary/40 border-transparent hover:bg-secondary/70'
                            )}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openHighlightMenu({
                                type: 'match',
                                eventId: m.id,
                                sportId,
                                leagueLabel: matches[0]?.leagueLabel ?? sportId,
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                          >
                            <div
                              onClick={() => togglePreviewCheck(m.id)}
                              className="flex items-start gap-1.5 px-1.5 py-1 cursor-pointer flex-1 min-w-0"
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
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingEvent(m); }}
                              data-no-league-menu="true"
                              className="shrink-0 w-[10%] min-w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-l border-border/50 hover:bg-primary/10"
                              title="Edit match"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                </>
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
                onPreviewContextMenu={openHighlightMenu}
                scrollToMatchId={scrollToMatch?.id}
              />
            </div>
          </div>
        </div>
      </div>

      {highlightMenu && (
        <div
          ref={highlightMenuRef}
          className="fixed z-170 min-w-44 rounded-lg border border-border bg-popover/98 p-1.5 shadow-2xl backdrop-blur-sm"
          style={{
            left: highlightMenu.x,
            top: highlightMenu.y,
          }}
        >
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {highlightMenu.type === 'match' ? 'Match Highlight' : highlightMenu.leagueLabel}
          </p>
          {highlightMenu.type === 'league' ? (
            featuredLeagues.has(highlightMenu.sportId) ? (
              <button
                onClick={() => setLeagueHighlight(highlightMenu.sportId, highlightMenu.leagueLabel, false)}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
              >
                Remove League Highlight
              </button>
            ) : (
              <button
                onClick={() => setLeagueHighlight(highlightMenu.sportId, highlightMenu.leagueLabel, true)}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
              >
                Add League Highlight
              </button>
            )
          ) : (() => {
            const isMatchHighlighted = events.find((e) => e.id === highlightMenu.eventId)?.isFeatured;
            if (isMatchHighlighted) {
              return (
                <button
                  onClick={() => setMatchHighlight(highlightMenu.eventId, false)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
                >
                  Remove Match Highlight
                </button>
              );
            }
            return (
              <button
                onClick={() => setMatchHighlight(highlightMenu.eventId, true)}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
              >
                Add Match Highlight
              </button>
            );
          })()}
        </div>
      )}

      {/* Add match modal */}
      <AddMatchModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={async (event) => {
          const hasSelectedInLeague = useScheduleStore
            .getState()
            .events
            .some((e) => e.sportId === event.sportId && e.isSelected);

          addEvents([event]);
          // If this is the first selected event for the league, pin it to top
          // so newly added custom matches are immediately visible in preview.
          if (!hasSelectedInLeague) {
            setLeagueOrder((prev) => [event.sportId, ...prev.filter((id) => id !== event.sportId)]);
          }
          // Durable local fallback: keep manual event across refresh even if Supabase fails.
          saveLocalCustomEvent(event);
          // Append to local cache so it survives the instant cache load on refresh
          appendCachedEvent(event);
          // Immediately save selection state (don't wait for 800ms debounce)
          const allEvents = useScheduleStore.getState().events;
          const selections: SavedSelectionState['selections'] = {};
          for (const e of allEvents) {
            if (e.isSelected || e.isFeatured || e.tags.length > 0) {
              selections[e.id] = { isSelected: e.isSelected, isFeatured: e.isFeatured, tags: e.tags };
            }
          }
          // Safety: if Zustand snapshot races, force-include this just-added event.
          selections[event.id] = {
            isSelected: event.isSelected,
            isFeatured: event.isFeatured,
            tags: event.tags,
          };
          saveSelectionToSupabase({
            selections,
            leagueOrder,
            featuredLeagues: Object.fromEntries(featuredLeagues),
            savedAt: Date.now(),
          }, effectiveTargetRef.current);
          // Persist to Supabase so it survives page refreshes (expires in 2 weeks)
          const res = await fetch('/api/custom-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          }).catch(() => null);
          if (!res?.ok) {
            console.warn('[CustomEvents] Supabase save failed, kept local fallback copy');
          }
        }}
      />

      {/* Settings lightbox */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <BusinessInfoModal
        isOpen={businessInfoOpen}
        onClose={() => setBusinessInfoOpen(false)}
        onSaved={({ business_name, logo_url }) => {
          setBusinessName(business_name || null);
          setBusinessLogoUrl(logo_url);
        }}
      />

      {/* Edit match modal */}
      <EditMatchModal
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={(id, updates) => {
          updateEvent(id, updates);
          const current = useScheduleStore.getState().events.find((e) => e.id === id);
          if (!current || current.source !== 'manual') return;

          const nextEvent: MatchEvent = { ...current, ...updates };
          saveLocalCustomEvent(nextEvent);
          removeCachedEvent(nextEvent.id);
          appendCachedEvent(nextEvent);

          void fetch('/api/custom-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nextEvent),
          }).catch(() => {
            console.warn('[CustomEvents] Supabase update failed, kept local fallback copy');
          });
        }}
      />

      {/* ── No-plugin detection banner ──────────────────────────────────────── */}
      {noPluginBanner && (
        <div className="fixed bottom-4 right-4 z-9999 flex items-start gap-3 max-w-sm w-full rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 shadow-2xl backdrop-blur-sm animate-in slide-in-from-bottom-2">
          <span className="text-lg leading-none mt-0.5 shrink-0">⚠️</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-200 leading-snug">No WordPress plugin detected</p>
            <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
              Your schedule was published but no plugin embed was found on your site.{' '}
              <a
                href="/api/plugin/download"
                className="underline text-amber-200 hover:text-white transition-colors"
                download
              >
                Download the plugin here
              </a>{' '}
              and add it in WordPress → Plugins → Add New → Upload Plugin.
            </p>
          </div>
          <button
            onClick={() => setNoPluginBanner(false)}
            className="shrink-0 mt-0.5 text-amber-400 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
