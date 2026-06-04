'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Plus,
  CheckSquare,
  Square,
  Loader2,
  RefreshCw,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  Pencil,
  Undo2,
  Redo2,
  Star,
  Printer,
  Clipboard,
  ClipboardPaste,
} from 'lucide-react';
import { useScheduleStore } from '@/lib/store';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useFavoritesStore } from '@/lib/favoritesStore';
import { getCachedEvents, setCachedEvents, appendCachedEvent, removeCachedEvent, saveLocalCustomEvent, loadLocalCustomEvents, removeLocalCustomEvent, syncLocalCustomEventsToSupabase, saveSelectionToSupabase, loadSelectionFromSupabase, loadSelectionState, saveSelectionState, setLastRemoteSnapshot, pruneStaleSelectionKeys, loadCustomLeagueLogo, type SavedSelectionState } from '@/lib/clientCache';
import { generateHTML } from '@/lib/generateHTML';
import { SPORTS_CONFIG, getCategories } from '@/lib/config';
import { formatDisplayDate } from '@/lib/timezone';
import { getEventDisplayTitle } from '@/lib/eventDisplay';
import type { MatchEvent } from '@/types';
import { PRESET_TAGS } from '@/types';
import SportFilter from '@/components/SportFilter';
import LeagueSection from '@/components/LeagueSection';
const AddMatchModal = dynamic(() => import('@/components/AddMatchModal'), { ssr: false });
const EditMatchModal = dynamic(() => import('@/components/EditMatchModal'), { ssr: false });
import PublishButton from '@/components/PublishButton';
const DateRangeCalendar = dynamic(() => import('@/components/DateRangeCalendar'), { ssr: false });
import SearchField from '@/components/SearchField';
const PreviewPanel = dynamic(() => import('@/components/PreviewPanel'), { ssr: false });
import DraggableEmbedPills from '@/components/DraggableEmbedPills';
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false });
const OrgModal = dynamic(() => import('@/components/OrgModal'), { ssr: false });
import UserProfileMenu from '@/components/UserProfileMenu';
const BusinessInfoModal = dynamic(() => import('@/components/BusinessInfoModal'), { ssr: false });
const WPConnectWizard = dynamic(() => import('@/components/onboarding/WPConnectWizard'), { ssr: false });
const MatchFinderPanel = dynamic(() => import('@/components/ai/MatchFinderPanel'), { ssr: false });
const PrintScheduleModal = dynamic(() => import('@/components/PrintScheduleModal'), { ssr: false });
import MatchFinderButton from '@/components/ai/MatchFinderButton';
import { MatchFinderProvider } from '@/components/ai/MatchFinderProvider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useOrgRealtime } from '@/hooks/useOrgRealtime';
import { useEmbedRealtime } from '@/hooks/useEmbedRealtime';
import { useSelectionsRealtime } from '@/hooks/useSelectionsRealtime';
import { useTimezoneStore } from '@/lib/timezoneStore';
import { isWorldCupPlaceholderTeamName, WORLD_CUP_SPORT_ID } from '@/lib/worldCup';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ScheduleHistoryState {
  events: MatchEvent[];
  leagueOrder: string[];
  featuredLeagues: Array<[string, string]>;
  signature: string;
}

interface EmbedInstanceState {
  display_id: string;
  embed_id: string | null;
  registered?: boolean;
}

const EMBED_ORDER_STORAGE_KEY = 'sportglobe_embed_order_v1';

function getEmbedInstanceKey(instance: EmbedInstanceState): string {
  return instance.embed_id ?? instance.display_id;
}

function loadStoredEmbedOrder(): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(EMBED_ORDER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function saveStoredEmbedOrder(instances: EmbedInstanceState[]) {
  if (typeof window === 'undefined') return;
  try {
    const order = instances.map(getEmbedInstanceKey).filter(Boolean);
    localStorage.setItem(EMBED_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch { /* ignore */ }
}

function normalizeEmbedInstances(
  registeredInstances: EmbedInstanceState[],
): EmbedInstanceState[] {
  const merged = new Map<string, EmbedInstanceState>();

  for (const instance of registeredInstances) {
    const key = getEmbedInstanceKey(instance);
    if (!key) continue;
    merged.set(key, { ...instance, registered: true });
  }

  return Array.from(merged.values());
}

function applyStoredEmbedOrder(instances: EmbedInstanceState[]): EmbedInstanceState[] {
  const savedOrder = loadStoredEmbedOrder();
  if (!savedOrder) return instances;

  const ordered = [
    ...savedOrder
      .map((id) => instances.find((instance) => getEmbedInstanceKey(instance) === id))
      .filter((instance): instance is EmbedInstanceState => instance !== undefined),
    ...instances.filter((instance) => !savedOrder.includes(getEmbedInstanceKey(instance))),
  ];
  saveStoredEmbedOrder(ordered);
  return ordered;
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
    setNote,
    toggleTag,
    batchToggleTag,
    customTags,
    setCustomTags,
    addCustomTag,
    removeCustomTag,
    stripTagFromAllEvents,
    updateEvent,
    selectAll,
    deselectAll,
    batchSetSelected,
    batchClearAll,
    setFetchStatuses,
    setDateRange,
    setActiveSportFilter,
  } = useScheduleStore();
  const selectedTimezone = useTimezoneStore((state) => state.timezone);

  const [scrollToMatch, setScrollToMatch] = useState<{ id: string; ts: number } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MatchEvent | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isRestoringSchedule, setIsRestoringSchedule] = useState(false);
  const [searchFilterIds, setSearchFilterIds] = useState<Set<string> | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewSelectedIds, setPreviewSelectedIds] = useState<Set<string>>(new Set());
  const [customTagInput, setCustomTagInput] = useState('');
  const [previewCheckedIds, setPreviewCheckedIds] = useState<Set<string>>(new Set());
  const [leagueOrder, setLeagueOrder] = useState<string[]>([]);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [embedClipboard, setEmbedClipboard] = useState<{
    selections: Record<string, { isSelected: boolean; isFeatured: boolean; tags: string[] }>;
    leagueOrder: string[];
    featuredLeagues: Record<string, string>;
    sourceEmbed: string;
  } | null>(null);
  const [panelContextMenu, setPanelContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [selectionCopied, setSelectionCopied] = useState(false);
  // Note: useState lazy initializer is ignored during SSR hydration in Next.js — we use
  // a plain default and set the real viewport-aware width in a useEffect after mount.
  const [panelWidth, setPanelWidth] = useState(700);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [businessInfoOpen, setBusinessInfoOpen] = useState(false);
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [wpCallbackSite, setWpCallbackSite] = useState<string | null>(null);
  const [wpCallbackError, setWpCallbackError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userUsername, setUserUsername] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(true); // default true — solo users always have full control
  const [pendingInvites, setPendingInvites] = useState<Array<{
    id: string; orgId: string; orgName: string; orgSlug: string; invitedBy: string; invitedAt: string;
  }>>([]);

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
  const [embedInstances, setEmbedInstances] = useState<EmbedInstanceState[]>([]);
  const [publishTarget, setPublishTarget] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [embedDropdownOpen, setEmbedDropdownOpen] = useState(false);
  const [noPluginBanner, setNoPluginBanner] = useState(false);
  const noPluginTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Swipe-to-close refs for preview panel
  const swipeTouchStartX = useRef<number | null>(null);
  const swipeTouchStartY = useRef<number | null>(null);
  const isActiveSwipeRef = useRef(false); // true once direction is confirmed horizontal
  // Mirror refs for global swipe handler — updated each render so the once-registered
  // document listeners always read the latest state without re-registering.
  const sidebarOpenRef = useRef(false);
  sidebarOpenRef.current = sidebarOpen;
  const previewOpenRef = useRef(false);
  previewOpenRef.current = previewOpen;

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

  const loadEmbedInstances = useCallback(() => {
    return fetch('/api/embed-instances', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const fetched: EmbedInstanceState[] = d.instances ?? [];
        const instances = applyStoredEmbedOrder(normalizeEmbedInstances(fetched));
        setEmbedInstances(instances);
        const liveIds = new Set(instances.map(getEmbedInstanceKey));
        pruneStaleSelectionKeys(liveIds);
        setPublishTarget((current) => {
          if (current && liveIds.has(current)) return current;
          const firstTarget = instances[0] ? getEmbedInstanceKey(instances[0]) : '';
          if (firstTarget && !didAutoSelectEmbed.current) didAutoSelectEmbed.current = true;
          return firstTarget;
        });
        // If no embed instances exist, unblock auto-save immediately since
        // the initial embed restore effect will never fire.
        if (instances.length === 0) {
          initialLoadDoneRef.current = true;
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadEmbedInstances();
    // Realtime (useEmbedRealtime) is the primary trigger for instant updates;
    // this slow poll is only a safety-net fallback for a dropped socket.
    const id = setInterval(loadEmbedInstances, 60_000);
    return () => clearInterval(id);
  }, [loadEmbedInstances]);

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
      setEmbedInstances(prev => {
        const next = prev.map(i =>
          getEmbedInstanceKey(i) === oldId
            ? { ...i, embed_id: trimmed, display_id: trimmed }
            : i
        );
        saveStoredEmbedOrder(next);
        return next;
      });
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
        if (!stateToApply || Object.keys(stateToApply.selections).length === 0) {
          initialLoadDoneRef.current = true;
          return;
        }
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
        initialLoadDoneRef.current = true;
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
        tags: [] as string[],
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

      // Note: when publishTarget is set, the snapshot effect (below) already fetches
      // schedule-history with isInitial=true and syncs events more completely —
      // no need to duplicate that request here.
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
        .then(async ({ schedule }: { schedule: { events_snapshot: MatchEvent[]; league_order: string[]; featured_leagues: Record<string, string>; week_label: string; published_at: string } | null }) => {
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
            // Mark snapshot as applying BEFORE the async Supabase load so that
            // applyInitial() (from isInitialEmbedRef effect) bails correctly if it
            // races against us.
            isSwitchingEmbedRef.current = true;
            snapshotAppliedForTargetRef.current = publishTarget;

            // Load from Supabase (cross-device) with localStorage as fallback.
            // BUG FIX: was using loadSelectionState (localStorage-only) which
            // ignored edits made from another device / browser.
            const userSelState = await loadSelectionFromSupabase(publishTarget);
            if (snapshotCancelled) return; // embed may have switched while awaiting

            const userSel = userSelState?.selections ?? {};
            // BUG FIX: was comparing against schedule.week_label (e.g. "Apr 2–8")
            // which produces an Invalid Date → NaN → comparison always false →
            // userSelIsNewer always false → snapshot always overwrote user edits.
            const publishedAt = schedule.published_at ? new Date(schedule.published_at).getTime() : 0;
            const userSelIsNewer = !!userSelState && userSelState.savedAt > publishedAt;

            const snapshotById = new Map(evts.map((e: MatchEvent) => [e.id, e]));
            const current = useScheduleStore.getState().events;
            const currentIds = new Set(current.map((e: MatchEvent) => e.id));

            // When user state is newer, it is fully authoritative:
            //   - events in userSel → apply user's selection flags
            //   - events NOT in userSel → deselect (user explicitly removed them)
            // When snapshot is newer, apply snapshot selection state to all events.
            const updated = current.map((e: MatchEvent) => {
              const snap = snapshotById.get(e.id);
              const userEntry = userSel[e.id];
              if (userSelIsNewer) {
                if (userEntry) return { ...e, ...userEntry };
                // Event was in snapshot but user removed it after publish
                return { ...e, isSelected: false, isFeatured: false, tags: [] as string[] };
              }
              return {
                ...e,
                isSelected: snap ? !!(snap.isSelected) : false,
                isFeatured: snap ? !!(snap.isFeatured) : false,
                tags: snap ? (snap.tags ?? []) : [],
              };
            });

            // Published custom events not in current API response:
            // - When snapshot is authoritative: include all in-range published events
            // - When user state is authoritative: only include ones user had selected
            //   (prevents deleted custom events from reappearing)
            const { dateRange: dr } = useScheduleStore.getState();
            const snapOnly = evts.filter((e: MatchEvent) => {
              if (currentIds.has(e.id) || e.date < dr.start || e.date > dr.end) return false;
              return userSelIsNewer ? !!userSel[e.id] : true;
            });

            setEvents([...updated, ...snapOnly]);

            // Apply league order + featured leagues — prefer user state when newer
            if (userSelIsNewer && userSelState) {
              if (userSelState.leagueOrder.length > 0) setLeagueOrder(userSelState.leagueOrder);
              // Apply user's featured leagues (even if empty — user may have cleared them)
              setFeaturedLeagues(new Map(Object.entries(userSelState.featuredLeagues ?? {})));
            } else {
              if (lo.length > 0) setLeagueOrder(lo);
              if (fl.size > 0) setFeaturedLeagues(fl);
            }

            initialLoadDoneRef.current = true;
          }
        })
        .catch(() => { if (!snapshotCancelled) setPublishedSnapshot(null); })
        .finally(() => { if (!snapshotCancelled) setSnapshotLoading(false); });
    };
    load(true);
    const id = setInterval(() => load(false), 120_000);
    return () => { snapshotCancelled = true; clearInterval(id); };
  }, [publishTarget]);

  // ─── Handle wp-callback redirect params ──────────────────────────────────
  // When returning from WordPress OAuth, open the wizard with connected state.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wpConnected = params.get('wp_connected');
    const wpSite = params.get('site');
    const wpError = params.get('wp_error');
    if (wpConnected === 'true' || wpError) {
      if (wpConnected === 'true' && wpSite) {
        setWpCallbackSite(decodeURIComponent(wpSite));
      }
      if (wpError) {
        setWpCallbackError(wpError);
      }
      setSetupWizardOpen(true);
      // Clean URL without triggering navigation
      const url = new URL(window.location.href);
      url.searchParams.delete('wp_connected');
      url.searchParams.delete('site');
      url.searchParams.delete('wp_error');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);

  // ─── Client-side auth guard ─────────────────────────────────────────────────
  // Redirect to /login if the Supabase session has expired or been revoked.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    // Check on mount and load user email
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error) { router.push('/login'); return; }
      setUserEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
      setUserAvatarUrl(
        (data.user?.user_metadata?.avatar_url as string | undefined) ?? null
      );

      // ─── First-time user detection: auto-show WordPress setup wizard ──────
      // Show for new users (account created within the last 2 minutes) who haven't
      // dismissed it before, and handle wp-callback redirect params.
      if (data.user?.created_at) {
        const createdAt = new Date(data.user.created_at).getTime();
        const now = Date.now();
        const isNewUser = now - createdAt < 2 * 60 * 1000; // within 2 min
        const dismissed = localStorage.getItem('wp_setup_dismissed') === 'true';
        if (isNewUser && !dismissed) {
          setSetupWizardOpen(true);
        }
      }

      // Lazy-bootstrap org: ensure user has at least one organization
      if (data.user?.id) {
        try {
          const orgRes = await fetch('/api/org');
          if (orgRes.ok) {
            const { organizations } = await orgRes.json();
            if (organizations?.length > 0) {
              setOrgName(organizations[0].name ?? null);
              // Determine if user is owner so we can gate destructive actions
              setIsOwner(organizations[0].role === 'owner');
              // Apply the saved org timezone before event fetches so schedules
              // use the same timezone shown in Settings on every device.
              fetch('/api/org/creator-settings')
                .then(r => r.ok ? r.json() : null)
                .then(csData => {
                  if (csData?.orgTimezone) {
                    useTimezoneStore.getState().setTimezone(csData.orgTimezone);
                  }
                })
                .catch(() => { /* non-fatal */ });
            }
            // Always check for pending invites so users with their own org
            // still see invites from other orgs (they can act on them in
            // Settings → Organization). Previously this was gated behind
            // !hasOrg which hid invites from anyone who had created an org.
            try {
              const invitesRes = await fetch('/api/org/invites');
              if (invitesRes.ok) {
                const { invites } = await invitesRes.json();
                if (invites?.length > 0) setPendingInvites(invites);
              }
            } catch { /* ignore */ }
            // Note: we no longer redirect to /onboarding automatically.
            // Org creation is available in Settings → Organization.
          }
        } catch {
          // Non-fatal: continue without org check
        }

        // Load business info for sidebar header
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

        // Load username + avatar from user_profiles
        // avatarUrl here is the db-stored value (from Google OAuth sync or future upload);
        // it overrides the raw metadata value set earlier, so the latest wins.
        fetch('/api/user-profile')
          .then(r => r.ok ? r.json() : null)
          .then(profileData => {
            if (profileData?.username) setUserUsername(profileData.username);
            if (profileData?.avatarUrl) setUserAvatarUrl(profileData.avatarUrl);
          })
          .catch(() => { /* non-fatal */ });

        // Load custom tag library
        fetch('/api/custom-tags')
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (Array.isArray(data?.tags)) setCustomTags(data.tags); })
          .catch(() => { /* non-fatal */ });
      }
    });
    // Listen for sign-out / token-refresh failures
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') router.push('/login');
      if (session?.user?.email) setUserEmail(session.user.email);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // ── Realtime: auto-refresh org state on membership changes ────
  const handleOrgRealtimeChange = useCallback(async () => {
    try {
      const orgRes = await fetch('/api/org');
      if (orgRes.ok) {
        const { organizations } = await orgRes.json();
        if (organizations?.length > 0) {
          setOrgName(organizations[0].name ?? null);
          setIsOwner(organizations[0].role === 'owner');
          setPendingInvites([]);
          // Refresh embed instances (org members' embeds now included)
          loadEmbedInstances();
          // Apply the saved org timezone before event fetches so schedules
          // use the same timezone shown in Settings on every device.
          fetch('/api/org/creator-settings')
            .then(r => r.ok ? r.json() : null)
            .then(csData => {
              if (csData?.orgTimezone) {
                useTimezoneStore.getState().setTimezone(csData.orgTimezone);
              }
            })
            .catch(() => { /* non-fatal */ });
          return;
        }
      }
      // No org — clear state, refresh embeds (remove former org members' embeds)
      setOrgName(null);
      setIsOwner(true); // solo user — full control
      setPublishTarget('');
      didAutoSelectEmbed.current = false;
      setPreviewOpen(false);
      setPreviewCheckedIds(new Set());
      loadEmbedInstances();
      try {
        const invitesRes = await fetch('/api/org/invites');
        if (invitesRes.ok) {
          const { invites } = await invitesRes.json();
          setPendingInvites(invites ?? []);
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, [loadEmbedInstances]);

  useOrgRealtime({
    userId,
    onChange: handleOrgRealtimeChange,
    enabled: !!userId,
  });

  useEmbedRealtime({
    userId,
    onChange: loadEmbedInstances,
    enabled: !!userId,
  });

  // ── Real-time selection sync (cross-device, e.g. Canada + Cambodia) ──
  // When another tab/device on this account writes to user_selections, apply
  // the changes to the in-memory events array so users see each other's edits
  // within ~1s without reload. The diff-based write in clientCache already
  // suppresses our own echo (snapshot updated below makes our next diff empty).
  useSelectionsRealtime({
    userId,
    enabled: !!userId,
    onRemoteChange: ({ embedTarget, state, deleted }) => {
      // Persist authoritative remote state to localStorage so it survives reloads
      // and is available when the user switches to that embed.
      if (deleted) {
        setLastRemoteSnapshot(embedTarget, {
          selections: {}, leagueOrder: [], featuredLeagues: {}, savedAt: state.savedAt,
        });
      } else {
        setLastRemoteSnapshot(embedTarget, state);
        saveSelectionState(state, embedTarget);
      }

      // Only patch in-memory state for the currently-active embed; other embeds
      // will pick up the change via loadSelectionState next time they're opened.
      if (embedTarget !== effectiveTargetRef.current) return;

      const remoteSel = deleted ? {} : state.selections;
      const current = useScheduleStore.getState().events;
      if (current.length > 0) {
        let changed = false;
        const merged = current.map((e) => {
          const r = remoteSel[e.id];
          if (r) {
            if (e.isSelected !== r.isSelected || e.isFeatured !== r.isFeatured
                || JSON.stringify(e.tags) !== JSON.stringify(r.tags)) {
              changed = true;
              return { ...e, isSelected: r.isSelected, isFeatured: r.isFeatured, tags: r.tags };
            }
            return e;
          }
          // Remote no longer tracks this event — clear local selection flags.
          if (e.isSelected || e.isFeatured || e.tags.length > 0) {
            changed = true;
            return { ...e, isSelected: false, isFeatured: false, tags: [] as string[] };
          }
          return e;
        });
        if (changed) setEvents(merged);
      }

      if (!deleted) {
        if (state.leagueOrder.length > 0) setLeagueOrder(state.leagueOrder);
        setFeaturedLeagues(new Map(Object.entries(state.featuredLeagues)));
      }
    },
  });

  // ── Broadcast channel: server-side push for org membership changes ────
  // This is the primary notification path for member removal. The removal
  // API sends a Broadcast message to `user-push:${userId}` which arrives
  // instantly — unlike postgres_changes which depends on REPLICA IDENTITY.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`user-push:${userId}`)
      .on('broadcast', { event: 'org-membership-changed' }, () => {
        handleOrgRealtimeChange();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, handleOrgRealtimeChange]);

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
  const worldCupLoadingRef = useRef(false);
  const previousTimezoneRef = useRef(selectedTimezone);
  const prevPreviewContentCountRef = useRef(0);
  const isSwitchingEmbedRef = useRef(false);
  // Prevents auto-save from overwriting stored selections before the initial
  // embed selection restore has finished. Without this, the 800ms auto-save
  // debounce can fire with all-deselected events (from loading with key '')
  // and overwrite the real saved-selection localStorage entry.
  const initialLoadDoneRef = useRef(false);
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
    const timeZone = useTimezoneStore.getState().timezone;

    // Try to load from client cache first for instant display
    if (!forceRefresh && events.length === 0) {
      const cached = getCachedEvents(currentRange, timeZone);
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
      const url = `/api/events?start=${currentRange.start}&end=${currentRange.end}&timeZone=${encodeURIComponent(timeZone)}`;
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 45_000); // 45s safety timeout
      let res: Response;
      try {
        res = await fetch(url, { signal: ctrl.signal, cache: forceRefresh ? 'no-store' : 'default' });
      } finally {
        clearTimeout(timeout);
      }
      
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

      const selectedBeforeFetch = events.filter(e => e.isSelected || e.isFeatured || e.tags.length > 0).length;

      // ── Preserve selected events missing from fresh API response ──────
      // When SportsDB times out, selected events would vanish because the
      // merge above only iterates events the API returned.  Fall back to
      // the in-memory events (manual refresh) or localStorage event cache
      // (page refresh where the closure captures events=[]).
      const prevForFallback = events.length > 0
        ? events
        : (getCachedEvents(currentRange, timeZone) ?? []);
      const prevById = new Map(prevForFallback.map(e => [e.id, e]));
      const preserved: MatchEvent[] = [];
      const preservedIds = new Set<string>();
      for (const [id, sel] of Object.entries(savedSel)) {
        if (!mergedRawById.has(id) && (sel.isSelected || sel.isFeatured)) {
          // Prefer snapshot (full event survives Supabase round-trip) over prev cache
          const eventData = sel.snapshot ?? prevById.get(id);
          if (eventData) {
            preserved.push({ ...eventData, isSelected: sel.isSelected, isFeatured: sel.isFeatured, tags: sel.tags });
            preservedIds.add(id);
          }
        }
      }
      for (const eventData of prevForFallback) {
        if (mergedRawById.has(eventData.id) || preservedIds.has(eventData.id)) continue;
        if (eventData.isSelected || eventData.isFeatured || eventData.tags.length > 0) {
          preserved.push(eventData);
          preservedIds.add(eventData.id);
        }
      }
      if (preserved.length > 0) {
        console.log(`[Schedule] Preserved ${preserved.length} selected events not in fresh API response`);
        allEvents.push(...preserved);
      }

      const selectedAfterMerge = allEvents.filter(e => e.isSelected || e.isFeatured || e.tags.length > 0).length;
      if (selectedBeforeFetch > 0 && selectedAfterMerge < selectedBeforeFetch) {
        console.warn(
          `[Schedule] Fetch merge reduced selected count ${selectedBeforeFetch} -> ${selectedAfterMerge}`,
          {
            range: currentRange,
            timeZone,
            apiEvents: mergedRaw.length,
            preserved: preserved.length,
            target: effectiveTargetRef.current,
          },
        );
      }

      setEvents(allEvents);
      setCachedEvents(currentRange, [...mergedRaw, ...preserved.map(e => ({ ...e, isSelected: false, isFeatured: false, tags: [] as string[] }))], timeZone);
      
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

      // Per-sport diagnostic summary — helps diagnose missing leagues in the client
      const bySport = new Map<string, number>();
      for (const e of allEvents) bySport.set(e.sportId, (bySport.get(e.sportId) ?? 0) + 1);
      const ncaamCount = bySport.get('basketball-ncaam') ?? 0;
      if (ncaamCount > 0) {
        console.log(`[Schedule] NCAA Men's Basketball: ${ncaamCount} events`);
      } else {
        console.warn(`[Schedule] NCAA Men's Basketball: 0 events for range ${currentRange.start}–${currentRange.end} (check server logs for [ESPN-NCAA] lines)`);
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
  }, [events, setEvents, setFetchStatuses]);

  const loadWorldCupFixtures = useCallback(async (forceRefresh = false) => {
    if (worldCupLoadingRef.current) return;

    const currentEvents = useScheduleStore.getState().events;
    const existingWorldCupEvents = currentEvents.filter((event) => event.sportId === WORLD_CUP_SPORT_ID);
    const hasVerbosePlaceholders = existingWorldCupEvents.some((event) =>
      (event.home !== 'TBD' && isWorldCupPlaceholderTeamName(event.home))
      || Boolean(event.away && event.away !== 'TBD' && isWorldCupPlaceholderTeamName(event.away)),
    );
    if (!forceRefresh && existingWorldCupEvents.length >= 100 && !hasVerbosePlaceholders) return;

    worldCupLoadingRef.current = true;
    setFetchStatuses({
      ...useScheduleStore.getState().fetchStatuses,
      [WORLD_CUP_SPORT_ID]: { loading: true, error: null },
    });

    try {
      const timeZone = useTimezoneStore.getState().timezone;
      const res = await fetch(`/api/events?sportId=${encodeURIComponent(WORLD_CUP_SPORT_ID)}&scope=all&timeZone=${encodeURIComponent(timeZone)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`World Cup API error: ${res.status}`);

      const data = await res.json();
      const fixtures = (data.events ?? []) as MatchEvent[];
      if (fixtures.length === 0) {
        setFetchStatuses({
          ...useScheduleStore.getState().fetchStatuses,
          [WORLD_CUP_SPORT_ID]: { loading: false, error: null },
        });
        return;
      }

      const latestEvents = useScheduleStore.getState().events;
      const latestWorldCupCount = latestEvents.filter((event) => event.sportId === WORLD_CUP_SPORT_ID).length;
      if (data.complete === false && latestWorldCupCount >= fixtures.length) {
        setFetchStatuses({
          ...useScheduleStore.getState().fetchStatuses,
          [WORLD_CUP_SPORT_ID]: { loading: false, error: null },
        });
        return;
      }

      const currentById = new Map(latestEvents.map((event) => [event.id, event]));
      const savedSel = loadSelectionState(effectiveTargetRef.current)?.selections ?? {};
      const nonWorldCupEvents = latestEvents.filter((event) => event.sportId !== WORLD_CUP_SPORT_ID);
      const mergedFixtures = fixtures.map((fixture) => {
        const current = currentById.get(fixture.id);
        const saved = savedSel[fixture.id];

        if (current && (current.isSelected || current.isFeatured || current.tags.length > 0)) {
          return {
            ...fixture,
            isSelected: current.isSelected,
            isFeatured: current.isFeatured,
            tags: current.tags,
          };
        }
        if (saved) return { ...fixture, ...saved };
        return fixture;
      });

      setEvents([...nonWorldCupEvents, ...mergedFixtures]);
      setFetchStatuses({
        ...useScheduleStore.getState().fetchStatuses,
        [WORLD_CUP_SPORT_ID]: { loading: false, error: null },
      });
      console.log(`[Schedule] Loaded ${mergedFixtures.length} World Cup fixtures for builder selection`);
    } catch (err) {
      console.error('[Schedule] World Cup fixture load failed:', err);
      setFetchStatuses({
        ...useScheduleStore.getState().fetchStatuses,
        [WORLD_CUP_SPORT_ID]: { loading: false, error: 'Fetch failed' },
      });
    } finally {
      worldCupLoadingRef.current = false;
    }
  }, [setEvents, setFetchStatuses]);

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
      void handleFetch().finally(() => {
        void loadWorldCupFixtures();
      });
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
  }, [handleFetch, loadWorldCupFixtures, setEvents]);

  useEffect(() => {
    if (previousTimezoneRef.current === selectedTimezone) return;
    previousTimezoneRef.current = selectedTimezone;
    if (!hasFetchedRef.current) return;
    void handleFetch(true).finally(() => {
      void loadWorldCupFixtures(true);
    });
  }, [handleFetch, loadWorldCupFixtures, selectedTimezone]);

  useEffect(() => {
    if (activeSportFilter !== WORLD_CUP_SPORT_ID) return;
    void loadWorldCupFixtures();
  }, [activeSportFilter, loadWorldCupFixtures]);

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

  // ─── Auto-save selection state (debounced 250ms) ──────────────────────────
  // Persists selections, tags, league order, and featured leagues to localStorage
  // so they survive page refreshes. Skips while fetching to avoid overwriting
  // saved state with intermediate (unmerged) event data.
  useEffect(() => {
    if (events.length === 0 || isFetching) return;
    // Don't save selections while the embed target is still unknown (embedInstances
    // haven't loaded yet). Saving to '' would contaminate the global slot and could
    // bleed into other embeds when they fallback-load from that slot.
    if (!effectiveTargetRef.current && embedInstances.length === 0) return;
    // Don't auto-save until the initial selection restore has finished,
    // otherwise we'd overwrite the saved selections with an all-deselected state.
    if (!initialLoadDoneRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const selections: SavedSelectionState['selections'] = {};
      for (const e of events) {
        if (e.isSelected || e.isFeatured || e.tags.length > 0) {
          const entry: SavedSelectionState['selections'][string] = { isSelected: e.isSelected, isFeatured: e.isFeatured, tags: e.tags };
          // Save full event data for SportsDB events so they can be resurrected
          // after a refresh even when TheSportsDB is rate-limited.
          if (e.id.startsWith('sportsdb-')) entry.snapshot = e;
          selections[e.id] = entry;
        }
      }
      saveSelectionToSupabase({
        selections,
        leagueOrder,
        featuredLeagues: Object.fromEntries(featuredLeagues),
        savedAt: Date.now(),
      }, effectiveTargetRef.current);
    }, 250);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [events, leagueOrder, featuredLeagues, isFetching, embedInstances]);

  // ─── Flush selection state on page unload (prevents losing recent changes) ─
  // The debounced save above may not fire if the user refreshes within 250ms.
  // This ensures the latest state is persisted synchronously before the page dies.
  useEffect(() => {
    const flush = () => {
      if (events.length === 0) return;
      const selections: SavedSelectionState['selections'] = {};
      for (const e of events) {
        if (e.isSelected || e.isFeatured || e.tags.length > 0) {
          const entry: SavedSelectionState['selections'][string] = { isSelected: e.isSelected, isFeatured: e.isFeatured, tags: e.tags };
          if (e.id.startsWith('sportsdb-')) entry.snapshot = e;
          selections[e.id] = entry;
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
      // Don't auto-open on mobile — the panel is full-screen and annoying
      if (window.innerWidth >= 768) {
        setPreviewOpen(true);
      }
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

  // Set viewport-aware initial panel width once after mount (lazy initializer is skipped during hydration)
  useEffect(() => {
    const vw = window.innerWidth;
    if (vw < 768) { setPanelWidth(vw); widthRef.current = vw; return; }
    const isPortraitTablet = vw >= 768 && vw <= 1100 && window.innerHeight > vw;
    if (isPortraitTablet) { setPanelWidth(vw); widthRef.current = vw; return; }
    if (vw >= 1200) {
      const w = Math.min(1000, Math.round(vw * 0.7));
      setPanelWidth(w); widthRef.current = w; return;
    }
    // Tablets 768–1199 (landscape), e.g. iPad mini
    const w = Math.max(500, Math.round(vw * 0.55));
    setPanelWidth(w); widthRef.current = w;
  }, []);

  // Sync panel DOM width on state change (width is managed outside React for resize perf)
  useEffect(() => {
    if (panelRef.current) panelRef.current.style.width = `${panelWidth}px`;
  }, [panelWidth]);

  // Sync toggle button position whenever open state or width changes.
  // We use a ref-based effect (not an inline style prop) so that direct DOM mutations
  // during pointer-drag in startResize() are not overwritten by React re-renders.
  useEffect(() => {
    const btn = toggleBtnRef.current;
    if (!btn) return;
    btn.style.right = previewOpen ? `${panelWidth}px` : '0px';
  }, [previewOpen, panelWidth]);

  // Clamp panel width to viewport on orientation/resize change (landscape → portrait fix)
  useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      if (vw < 768 && panelWidth > vw) {
        setPanelWidth(vw);
        widthRef.current = vw;
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [panelWidth]);

  // Lock body scroll on mobile when preview panel or sidebar is open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Lock background scroll on mobile AND portrait-tablet (where panel is full-screen)
    const isPortraitTablet = window.innerWidth >= 768 && window.innerWidth <= 1100 && window.innerHeight > window.innerWidth;
    const shouldLock = (previewOpen || sidebarOpen) && (
      window.innerWidth < 768 || (previewOpen && isPortraitTablet)
    );
    document.body.style.overflow = shouldLock ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [previewOpen, sidebarOpen]);

  // Non-passive touchmove on the panel so we can call preventDefault() to block
  // vertical scroll while a horizontal swipe gesture is in progress.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const blockScroll = (e: TouchEvent) => {
      if (isActiveSwipeRef.current) e.preventDefault();
    };
    panel.addEventListener('touchmove', blockScroll, { passive: false });
    return () => panel.removeEventListener('touchmove', blockScroll);
  }, []); // panelRef.current is stable after mount (panel is always rendered)

  // ─── Global swipe: open/close sidebar + open preview ──────────────────────
  // State machine (mobile drawer mode only — when hamburger bar is visible):
  //   Sidebar open   + swipe left  anywhere → close sidebar
  //   Nothing open   + swipe right           → open left sidebar
  //   Nothing open   + swipe left            → open preview panel
  //   Preview open   → handled exclusively by the panel's own touch handlers
  useEffect(() => {
    // Plain objects are captured once in the closure and remain stable.
    const gs = { x: null as number | null, y: null as number | null, dir: null as 'h' | 'v' | null };

    const inDrawerMode = () =>
      typeof window !== 'undefined' &&
      (window.innerWidth < 1024 ||
        (window.innerHeight <= 500 && window.innerWidth > window.innerHeight));

    const onStart = (e: TouchEvent) => {
      if (!inDrawerMode()) { gs.x = null; return; }
      gs.x = e.touches[0].clientX;
      gs.y = e.touches[0].clientY;
      gs.dir = null;
    };

    const onMove = (e: TouchEvent) => {
      if (gs.x === null || gs.y === null || gs.dir !== null) return;
      const dx = Math.abs(e.touches[0].clientX - gs.x);
      const dy = Math.abs(e.touches[0].clientY - gs.y);
      if (dx > 8 || dy > 8) {
        gs.dir = dx >= dy ? 'h' : 'v';
        // Vertical: cancel this gesture entirely
        if (gs.dir === 'v') { gs.x = null; gs.y = null; }
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (gs.x === null || gs.dir !== 'h') {
        gs.x = null; gs.y = null; gs.dir = null;
        return;
      }
      const dx = e.changedTouches[0].clientX - gs.x;
      gs.x = null; gs.y = null; gs.dir = null;
      if (!inDrawerMode()) return;

      const THRESHOLD = 40;
      const soOpen = sidebarOpenRef.current;
      const pvOpen = previewOpenRef.current;

      if (soOpen) {
        // Sidebar is open — left swipe anywhere (including backdrop) closes it
        if (dx < -THRESHOLD) setSidebarOpen(false);
      } else if (!pvOpen) {
        // Neither panel open — right opens sidebar, left opens preview
        if (dx > THRESHOLD) setSidebarOpen(true);
        else if (dx < -THRESHOLD) setPreviewOpen(true);
      }
      // Preview open: the panel's own onTouchEnd handles close — nothing to do here.
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, []); // stable — reads live state via sidebarOpenRef / previewOpenRef

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
    setCustomTagInput('');
  }, []);

  /** Fire-and-forget: persist the current custom tag library to Supabase */
  const saveCustomTagsToAPI = useCallback((tags: string[]) => {
    fetch('/api/custom-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    }).catch(() => {});
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

  useEffect(() => {
    if (!panelContextMenu) return;
    const dismiss = () => setPanelContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [panelContextMenu]);

  // After the menu renders, clamp it so it never overflows the viewport edge.
  useEffect(() => {
    if (!highlightMenu || !highlightMenuRef.current) return;
    const el = highlightMenuRef.current;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8; // px gap from edge
    if (rect.right > vw - MARGIN) {
      el.style.left = `${Math.max(MARGIN, highlightMenu.x - rect.width)}px`;
    }
    if (rect.bottom > vh - MARGIN) {
      el.style.top = `${Math.max(MARGIN, highlightMenu.y - rect.height)}px`;
    }
  }, [highlightMenu]);

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

  const handlePreviewMatchClick = useCallback((id: string, multi: boolean) => {
    setPreviewSelectedIds((prev) => {
      if (multi) {
        // Ctrl/Cmd+click: toggle this match in/out of the current selection
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }
      // Plain click: select only this match (deselect all others)
      if (prev.size === 1 && prev.has(id)) return new Set(); // clicking the one selected match deselects it
      return new Set([id]);
    });
  }, []);

  const handlePreviewClearSelection = useCallback(() => {
    setPreviewSelectedIds(new Set());
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

    // Non-manual items are cleared (isSelected, isFeatured, tags) only.
    if (nonManualIds.length > 0) {
      batchClearAll(nonManualIds);
    }

    // Manual/custom items are removed locally only after Supabase confirms delete.
    let failedManualIds: string[] = [];
    if (manualIds.length > 0) {
      const result = await deleteManualEventsPermanently(manualIds);
      failedManualIds = result.failedIds;
    }

    setPreviewCheckedIds(new Set(failedManualIds));
  }, [previewCheckedIds, events, batchClearAll, deleteManualEventsPermanently]);

  const handleDeleteAll = useCallback(async () => {
    const previewEvents = events.filter((e) => e.isSelected || e.isFeatured);
    const manualIds = previewEvents.filter((e) => e.source === 'manual').map((e) => e.id);
    const nonManualIds = previewEvents.filter((e) => e.source !== 'manual').map((e) => e.id);

    if (nonManualIds.length > 0) {
      batchClearAll(nonManualIds);
    }

    let failedManualIds: string[] = [];
    if (manualIds.length > 0) {
      const result = await deleteManualEventsPermanently(manualIds);
      failedManualIds = result.failedIds;
    }

    setDeleteAllConfirm(false);
    setPreviewCheckedIds(new Set(failedManualIds));
  }, [events, batchClearAll, deleteManualEventsPermanently]);

  // ─── HTML generation — recomputes whenever leagueOrder, events, or sortVersion changes ─
  const html = useMemo(
    () => (selectedCount > 0 || featuredMatches.length > 0 || featuredLeagues.size > 0)
      ? generateHTML(events, leagueOrder, featuredLeagues)
      : '',
    [events, leagueOrder, selectedCount, featuredMatches.length, featuredLeagues]
  );

  // Scroll HTML preview back to top whenever the league order changes so the reorder is visible
  useEffect(() => {
    if (htmlPreviewRef.current) htmlPreviewRef.current.scrollTop = 0;
  }, [leagueOrder]);
  // Keep a ref for publish/copy so it always has the latest
  const htmlRef = useRef('');
  useEffect(() => { if (html) htmlRef.current = html; }, [html]);
  const getHTML = useCallback(() => htmlRef.current || generateHTML(events, undefined, featuredLeagues), [events, featuredLeagues]);

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

  const copySelections = useCallback(() => {
    const selections: Record<string, { isSelected: boolean; isFeatured: boolean; tags: string[] }> = {};
    const hasPreviewChecks = previewCheckedIds.size > 0;
    
    for (const e of events) {
      if (hasPreviewChecks) {
        // Active checkboxes in the preview panel: copy only these checked items.
        // We ensure they preserve their isFeatured/tags if they have them, but 
        // enforce isSelected=true since they were explicitly requested for copy.
        if (previewCheckedIds.has(e.id)) {
          selections[e.id] = { isSelected: true, isFeatured: e.isFeatured, tags: [...e.tags] };
        }
      } else {
        // Default clipboard behavior (no explicit subset selected in the right panel)
        if (e.isSelected || e.isFeatured || e.tags.length > 0) {
          selections[e.id] = { isSelected: e.isSelected, isFeatured: e.isFeatured, tags: [...e.tags] };
        }
      }
    }
    setEmbedClipboard({
      selections,
      leagueOrder: [...leagueOrder],
      featuredLeagues: Object.fromEntries(featuredLeagues),
      sourceEmbed: effectiveTarget,
    });
    setSelectionCopied(true);
    setTimeout(() => setSelectionCopied(false), 2000);
    setPanelContextMenu(null);
    closeHighlightMenu();
  }, [events, leagueOrder, featuredLeagues, effectiveTarget, previewCheckedIds, closeHighlightMenu]);

  const pasteSelections = useCallback(() => {
    if (!embedClipboard) return;
    // Push current state to undo stack so paste can be undone with Ctrl+Z
    const current = captureHistoryState();
    undoStackRef.current.push(current);
    redoStackRef.current.length = 0;
    
    const updated = events.map(e => {
      const sel = embedClipboard.selections[e.id];
      if (sel) {
        // MERGE behavior:
        // Do not overwrite existing selections/highlights/tags.
        // If a match is already selected, keep it selected. If incoming specifies it's selected, mark it selected.
        return {
          ...e,
          isSelected: e.isSelected || sel.isSelected,
          isFeatured: e.isFeatured || sel.isFeatured,
          tags: Array.from(new Set([...e.tags, ...sel.tags]))
        };
      }
      return e; // Leave existing matches that aren't in clipboard untouched
    });
    
    setEvents(updated);
    
    // Add incoming leagues to the end of the order if not already present
    const incomingLeagues = embedClipboard.leagueOrder.filter(l => !leagueOrder.includes(l));
    setLeagueOrder([...leagueOrder, ...incomingLeagues]);
    
    // Merge featured leagues
    const newFeatured = new Map(featuredLeagues);
    for (const [sportId, label] of Object.entries(embedClipboard.featuredLeagues)) {
      if (!newFeatured.has(sportId)) {
        newFeatured.set(sportId, label);
      }
    }
    setFeaturedLeagues(newFeatured);
    
    setPanelContextMenu(null);
    closeHighlightMenu();
    setPreviewCheckedIds(new Set()); // clear any selection checks after paste
  }, [embedClipboard, events, captureHistoryState, setEvents, leagueOrder, featuredLeagues, closeHighlightMenu]);

  // Ctrl+C / Ctrl+V shortcuts for embed selection copy/paste
  // Defined here (after copySelections/pasteSelections) to avoid TDZ ordering issues.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const key = event.key.toLowerCase();
      if (key === 'c' && !inInput && !window.getSelection()?.toString()) {
        event.preventDefault();
        copySelections();
        return;
      }
      if (key === 'v' && !inInput) {
        event.preventDefault();
        pasteSelections();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copySelections, pasteSelections]);

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
    eventsSnapshot: events
      .filter((e) => e.isSelected || e.isFeatured)
      .map((e) => e.isFeatured && !e.isSelected ? { ...e, isSelected: true } : e),
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
      const timeZone = useTimezoneStore.getState().timezone;

      // Start fetching full-week events immediately while local persistence runs.
      const eventsPromise = fetch(`/api/events?start=${rangeStart}&end=${rangeEnd}&timeZone=${encodeURIComponent(timeZone)}`);

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
          byId.set(snap.id, snap.source === 'manual'
            ? { ...existing, ...snap, isSelected: true }
            : { ...existing, isSelected: true, isFeatured: Boolean(snap.isFeatured), tags: [...snap.tags] });
        } else if (snap.date >= rangeStart && snap.date <= rangeEnd) {
          // Only add snapshot-only events that fall within the restored date range.
          byId.set(snap.id, { ...snap, isSelected: true });
        }
      }

      const restoredFullWeek = Array.from(byId.values());
      setEvents(restoredFullWeek);
      setCachedEvents({ start: rangeStart, end: rangeEnd }, restoredFullWeek, timeZone);

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
    <MatchFinderProvider>
    <div className="flex h-dvh bg-background text-foreground">
      {/* ── Mobile sidebar backdrop ───────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-150 bg-black/60 backdrop-blur-sm lg:hidden phone-landscape-backdrop"
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
          'fixed inset-y-0 left-0 z-160 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          'phone-landscape-drawer',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <Separator className="mx-3" />

          <div className="px-2 pt-2">
            <SportFilter
              activeFilter={activeSportFilter}
              onFilterChange={(f) => { setActiveSportFilter(f); setFlashKey(k => k + 1); }}
              onLeagueSelect={() => setSidebarOpen(false)}
              events={events}
              businessName={businessName}
              businessLogoUrl={businessLogoUrl}
            />
          </div>
        </div>

        {/* Pinned user profile at bottom */}
        <div className="shrink-0 border-t border-border px-2 py-1.5">
          <UserProfileMenu email={userEmail} username={userUsername} onLogout={handleLogout} onBusinessInfo={() => setBusinessInfoOpen(true)} onSettings={() => setSettingsOpen(true)} onOrgManage={() => setOrgModalOpen(true)} onSetup={() => setSetupWizardOpen(true)} businessLogoUrl={businessLogoUrl} orgName={orgName} avatarUrl={userAvatarUrl} />
        </div>
      </aside>

      {/* ── Main Area ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header ref={headerRef} className="shrink-0 border-b border-border bg-background/95 backdrop-blur-sm px-3 sm:px-6 py-3 relative z-100 phone-ls-header">
          {/* ── Row 1: Calendar (left) + Publish controls (right) ─────────────── */}
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mobile hamburger */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden phone-landscape-burger p-2.5 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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

              {/* Fetch button — visible on sm+ only; on mobile it drops to row 2 */}
              <Button
                onClick={() => handleFetch(true)}
                disabled={isFetching}
                size="default"
                className="hidden sm:flex"
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
              {/* Undo/Redo — always visible on desktop; hidden on mobile (moved to row 2) */}
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={!canUndo}
                title="Undo last schedule change (Ctrl+Z)"
                className="hidden sm:flex"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={!canRedo}
                title="Redo last undone change (Ctrl+Shift+Z)"
                className="hidden sm:flex"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
              <PublishButton
                getHTML={getHTML}
                disabled={selectedCount === 0 && featuredMatches.length === 0 && featuredLeagues.size === 0}
                onDeleteSchedule={handleDeleteSchedule}
                canDeleteSchedule={isOwner}
                getSnapshotData={getSnapshotData}
                onRestoreSchedule={handleRestoreSchedule}
                hasCurrentSelections={selectedCount > 0 || featuredMatches.length > 0 || featuredLeagues.size > 0}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrintModalOpen(true)}
                disabled={selectedCount === 0 && featuredMatches.length === 0 && featuredLeagues.size === 0}
                title="Print / Save as PDF"
                className="hidden sm:flex"
              >
                <Printer className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 mt-2 sm:hidden">
            {/* Refresh — small, left-aligned */}
            <Button
              onClick={() => handleFetch(true)}
              disabled={isFetching}
              size="sm"
              variant="outline"
            >
              {isFetching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {isFetching ? 'Fetching...' : 'Refresh'}
            </Button>

            {/* Undo / Redo — right side */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 sm:gap-3 mt-3 flex-wrap phone-ls-toolbar">
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

            <Button variant="ghost" size="sm" className="sm:text-xs sm:h-7 sm:px-2" onClick={selectAll}>
              <CheckSquare className="w-3.5 h-3.5" /> <span className="phone-ls-hide">Select All</span>
            </Button>
            <Button variant="ghost" size="sm" className="sm:text-xs sm:h-7 sm:px-2" onClick={deselectAll}>
              <Square className="w-3.5 h-3.5" /> <span className="phone-ls-hide">Deselect</span>
            </Button>

            <Separator orientation="vertical" className="h-5 hidden sm:block" />

            <Button variant="secondary" size="sm" className="sm:text-xs sm:h-7 sm:px-2" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> <span className="phone-ls-hide">Add Custom Event</span>
            </Button>

            <Separator orientation="vertical" className="h-5 hidden sm:block" />

            <MatchFinderButton />
          </div>
        </header>

        {/* Match list */}
        <div className="relative flex-1 overflow-y-auto px-3 sm:px-6 pb-4">

          {isFetching && events.length > 0 && (
            <div className="sticky top-0 z-20 flex items-center justify-center py-1.5 pointer-events-none">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur-sm px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                Updating matches...
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
              onSetNote={setNote}
              onToggleTag={toggleTag}
              isFeaturedLeague={featuredLeagues.has(sportId)}
              onToggleFeaturedLeague={toggleFeaturedLeague}
              onBulkSelectLeague={bulkSelectLeague}
            />
          ))}
        </div>
      </main>

      {/* ── Preview panel (custom resizable, no overlay) ────────────────────── */}
      <button
        ref={toggleBtnRef}
        onClick={() => { setPreviewOpen((o) => !o); setDeleteAllConfirm(false); }}
        title={previewOpen ? 'Close preview' : 'Open preview'}
        className={cn(
          // z-90 keeps this below the header (z-100) so header dropdowns render above it
          "fixed z-90 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center bg-secondary border border-border border-r-0 rounded-l-md px-2.5 py-5 md:px-1 md:py-3 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
          // On mobile, hide when preview open (panel is full-width, button would clip off-screen)
          previewOpen && "max-md:hidden"
        )}
      >
        {previewOpen ? <ChevronRight className="w-4 h-4 md:w-3.5 md:h-3.5" /> : <ChevronLeft className="w-4 h-4 md:w-3.5 md:h-3.5" />}
      </button>

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
        onTouchStart={(e) => {
          swipeTouchStartX.current = e.touches[0].clientX;
          swipeTouchStartY.current = e.touches[0].clientY;
          isActiveSwipeRef.current = false;
        }}
        onTouchMove={(e) => {
          if (swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;
          const dx = e.touches[0].clientX - swipeTouchStartX.current;
          const dy = Math.abs(e.touches[0].clientY - swipeTouchStartY.current);
          // If vertical movement clearly dominates, cancel this swipe gesture and
          // spring the panel back so it doesn't stay stuck mid-screen.
          if (dy > 20 && dy > Math.abs(dx) * 1.5) {
            isActiveSwipeRef.current = false;
            swipeTouchStartX.current = null;
            swipeTouchStartY.current = null;
            if (panelRef.current) {
              panelRef.current.style.transition = 'transform 150ms ease-in-out';
              panelRef.current.style.transform = 'translateX(0)'; // snap back, don't leave stuck
            }
            return;
          }
          // Only track rightward swipe (dismiss direction)
          if (dx <= 0 || !panelRef.current) return;
          // Once horizontal direction is confirmed, mark swipe active so the
          // non-passive native listener can block vertical scroll
          isActiveSwipeRef.current = true;
          // Kill CSS transition so the panel tracks the finger at 60fps
          panelRef.current.style.transition = 'none';
          panelRef.current.style.transform = `translateX(${dx}px)`;
        }}
        onTouchEnd={(e) => {
          isActiveSwipeRef.current = false;
          // Always restore transition before any state change
          if (panelRef.current) panelRef.current.style.transition = 'transform 150ms ease-in-out';
          if (swipeTouchStartX.current === null || swipeTouchStartY.current === null) {
            // Swipe was cancelled mid-gesture (vertical detection) — make sure panel
            // is snapped to open position in case it was partially translated.
            if (panelRef.current) panelRef.current.style.transform = 'translateX(0)';
            return;
          }
          const dx = e.changedTouches[0].clientX - swipeTouchStartX.current;
          swipeTouchStartX.current = null;
          swipeTouchStartY.current = null;
          // Dismiss if dragged past 35% of panel width
          if (dx > panelWidth * 0.35) {
            setPreviewOpen(false);
          } else if (panelRef.current) {
            // Spring back to original position
            panelRef.current.style.transform = 'translateX(0)';
          }
        }}
        onTouchCancel={() => {
          isActiveSwipeRef.current = false;
          swipeTouchStartX.current = null;
          swipeTouchStartY.current = null;
          if (panelRef.current) {
            panelRef.current.style.transition = 'transform 150ms ease-in-out';
            panelRef.current.style.transform = 'translateX(0)';
          }
        }}
      >
        {/* Resize handle */}
        <div
          onPointerDown={startResize}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/20 transition-colors"
        />
        {/* Panel header */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 border-b border-border">
          <h3 className="text-sm font-bold text-foreground shrink-0">Schedule Preview</h3>

          {/* Publish-to: pills (desktop) / dropdown (mobile) */}
          {embedInstances.length > 0 && (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-[11px] text-muted-foreground shrink-0">Publish to:</span>

              {/* Desktop (≥1536px): draggable pills — double-click to rename, drag to reorder */}
              <div className="hidden 2xl:block min-w-0 flex-1 overflow-hidden">
                <DraggableEmbedPills
                  instances={embedInstances}
                  publishTarget={publishTarget}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onSelect={(val) => setPublishTarget(val)}
                  onDoubleClick={(val, displayId) => { setRenamingId(val); setRenameValue(displayId); }}
                  onRenameChange={setRenameValue}
                  onRenameCommit={(val) => commitRename(val)}
                  onRenameCancel={() => setRenamingId(null)}
                  onReorder={(next) => { setEmbedInstances(next); saveStoredEmbedOrder(next); }}
                />
              </div>

              {/* Phone / tablet compact dropdown (hidden only on very-large desktop ≥1536px) */}
              <div className="2xl:hidden relative min-w-0">
                <button
                  onClick={() => setEmbedDropdownOpen(o => !o)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-accent/60 hover:bg-accent border border-border/50 max-w-35"
                >
                  <span className="truncate">
                    {embedInstances.find(i => (i.embed_id ?? i.display_id) === publishTarget)?.display_id
                      ?? embedInstances[0]?.display_id}
                  </span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
                {embedDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setEmbedDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-20 min-w-40 py-1 overflow-hidden">
                      {embedInstances.map((inst) => {
                        const val = inst.embed_id ?? inst.display_id;
                        const isActive = val === publishTarget || (!publishTarget && inst === embedInstances[0]);
                        return (
                          <div key={val} className="flex items-center group">
                            <button
                              onClick={() => { setPublishTarget(val); setEmbedDropdownOpen(false); }}
                              className={cn(
                                'flex-1 text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors truncate',
                                isActive && 'text-primary font-medium bg-primary/10',
                              )}
                            >
                              {inst.display_id}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
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
        <div className="relative flex flex-col sm:flex-row flex-1 overflow-hidden phone-ls-preview-body tablet-portrait-preview-body">
          {isRestoringSchedule && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/75 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-lg">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading schedule...
              </div>
            </div>
          )}

          {/* Left: match list */}
          <aside
            className="w-full sm:w-60 shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-sidebar flex flex-col overflow-hidden relative max-h-[28vh] sm:max-h-none phone-ls-preview-aside tablet-portrait-preview-aside"
            onContextMenu={(e) => {
              const hasOwnMenu = (e.target as HTMLElement).closest('[data-has-context-menu]');
              if (hasOwnMenu) return;
              e.preventDefault();
              const x = Math.min(e.clientX, window.innerWidth - 220);
              const y = Math.min(e.clientY, window.innerHeight - 130);
              setPanelContextMenu({ x, y });
            }}
          >
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

            <div ref={sidebarScrollRef} className="flex-1 overflow-y-auto overscroll-y-contain p-2 space-y-3">
              {selectedCount === 0 && featuredOnlyLeagues.length === 0 && featuredMatches.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center pt-8">No matches selected</p>
              ) : (
                <>
                {/* ─── Highlighted / starred matches ───────────────────── */}
                {featuredMatches.length > 0 && (
                  <div className="border border-yellow-500/40 bg-yellow-500/5 rounded-lg p-2">
                    <p className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide mb-1.5">
                      Highlighted Matches
                    </p>
                    <div className="space-y-1">
                      {featuredMatches.map((m) => (
                        <div
                          key={m.id}
                          className="group flex items-stretch text-[10px] rounded-md leading-snug select-none transition-all border overflow-hidden bg-amber-500/10 border-amber-500/40"
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
                          {/* Star — click to un-highlight */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFeatured(m.id); }}
                            className="shrink-0 w-6 flex items-center justify-center text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-colors"
                            title="Remove from highlights"
                          >
                            <Star className="w-3 h-3" fill="currentColor" />
                          </button>
                          <div className="flex items-start gap-1.5 px-1.5 py-1 flex-1 min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate text-foreground">
                                {getEventDisplayTitle(m, { stripLeaguePrefix: true })}
                              </div>
                              <div className="text-muted-foreground mt-0.5">
                                {formatDisplayDate(m.date)} · {m.time}
                                <span className="ml-1 text-muted-foreground/60">{m.leagueLabel ?? m.sportId}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingEvent(m); }}
                            className="shrink-0 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-l border-amber-500/20 hover:bg-amber-400/10"
                            title="Edit match"
                          >
                            <Pencil className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {featuredOnlyLeagues.map((league) => (
                  <div
                    key={`featured-only-${league.sportId}`}
                    data-has-context-menu="true"
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
                    data-has-context-menu="true"
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
                                : m.isFeatured
                                  ? 'bg-amber-500/10 border-amber-500/40'
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
                            {/* Star — toggle featured without triggering row selection */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFeatured(m.id); }}
                              data-no-league-menu="true"
                              className={cn(
                                'shrink-0 w-6 flex items-center justify-center transition-colors hover:bg-amber-400/10',
                                m.isFeatured ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground/30 hover:text-muted-foreground/60'
                              )}
                              title={m.isFeatured ? 'Remove from highlights' : 'Add to highlights'}
                            >
                              <Star className="w-3 h-3" fill={m.isFeatured ? 'currentColor' : 'none'} />
                            </button>
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
                                  {getEventDisplayTitle(m, { stripLeaguePrefix: true })}
                                </div>
                                <div className="text-muted-foreground mt-0.5">
                                  {formatDisplayDate(m.date)} · {m.time}
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
          <div ref={htmlPreviewRef} className="flex-1 overflow-y-auto overscroll-y-contain" onPointerDown={() => setActiveSortLeague(null)}>
            <div className="p-3 sm:p-6">
              <PreviewPanel
                html={html}
                matchCount={selectedCount}
                leagueCount={selectedLeagues}
                onCopy={handleCopyHTML}
                copied={copied}
                onPreviewContextMenu={openHighlightMenu}
                scrollToMatchId={scrollToMatch?.id}
                previewSelectedIds={previewSelectedIds}
                onPreviewMatchClick={handlePreviewMatchClick}
                onPreviewClearSelection={handlePreviewClearSelection}
              />
            </div>
          </div>
        </div>
      </div>

      {panelContextMenu && (
        <div
          className="fixed z-170 min-w-48 rounded-lg border border-border bg-popover/98 p-1.5 shadow-2xl backdrop-blur-sm"
          style={{ left: panelContextMenu.x, top: panelContextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Schedule Clipboard
          </p>
          <button
            onClick={copySelections}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span className="flex-1">Copy Sports Selection</span>
            <kbd className="text-[9px] text-muted-foreground bg-muted px-1 rounded">Ctrl+C</kbd>
          </button>
          <button
            onClick={pasteSelections}
            disabled={!embedClipboard}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="flex-1">Paste Sports Selection</span>
            <kbd className="text-[9px] text-muted-foreground bg-muted px-1 rounded">Ctrl+V</kbd>
          </button>
          {embedClipboard && embedClipboard.sourceEmbed !== effectiveTarget && (
            <p className="px-2 pt-1 pb-0.5 text-[9px] text-muted-foreground/60 border-t border-border/30 mt-1">
              From: {embedClipboard.sourceEmbed} &middot; {Object.keys(embedClipboard.selections).length} matches
            </p>
          )}
        </div>
      )}

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
            {highlightMenu.type === 'match'
              ? (previewSelectedIds.size > 1
                  ? `${previewSelectedIds.size} Matches Selected`
                  : 'Match Options')
              : highlightMenu.leagueLabel}
          </p>

          <button
            onClick={copySelections}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span className="flex-1">Copy</span>
            <kbd className="text-[9px] text-muted-foreground bg-muted px-1 rounded">Ctrl+C</kbd>
          </button>
          <button
            onClick={pasteSelections}
            disabled={!embedClipboard}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="flex-1">Paste</span>
            <kbd className="text-[9px] text-muted-foreground bg-muted px-1 rounded">Ctrl+V</kbd>
          </button>
          <div className="my-1 border-t border-border/50" />

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
            const matchEvent = events.find((e) => e.id === highlightMenu.eventId);
            const isMatchHighlighted = matchEvent?.isFeatured;
            // If any preview matches are selected, apply tags to the whole selection;
            // otherwise fall back to just the right-clicked match.
            const tagTargetIds = previewSelectedIds.size > 0
              ? Array.from(previewSelectedIds)
              : [highlightMenu.eventId];
            const matchTags = matchEvent?.tags ?? [];
            return (
              <>
                {isMatchHighlighted ? (
                  <button
                    onClick={() => setMatchHighlight(highlightMenu.eventId, false)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
                  >
                    Remove Match Highlight
                  </button>
                ) : (
                  <button
                    onClick={() => setMatchHighlight(highlightMenu.eventId, true)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
                  >
                    Add Match Highlight
                  </button>
                )}
                <div className="my-1 border-t border-border/50" />
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
                {PRESET_TAGS.map((preset) => {
                  const active = tagTargetIds.every((id) => events.find((e) => e.id === id)?.tags.includes(preset.value));
                  return (
                    <button
                      key={preset.value}
                      onClick={() => { batchToggleTag(tagTargetIds, preset.value); closeHighlightMenu(); }}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        active ? 'bg-accent font-medium text-foreground' : 'text-foreground hover:bg-accent'
                      )}
                    >
                      <span>{preset.icon}</span>
                      <span className="flex-1">{preset.value}</span>
                      {active && <span className="text-primary text-[10px]">✓</span>}
                    </button>
                  );
                })}
                {customTags.map((ctag) => {
                  const active = tagTargetIds.every((id) => events.find((e) => e.id === id)?.tags.includes(ctag));
                  return (
                    <div key={ctag} className="flex items-center gap-0.5">
                      <button
                        onClick={() => { batchToggleTag(tagTargetIds, ctag); closeHighlightMenu(); }}
                        className={cn(
                          'flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors min-w-0',
                          active ? 'bg-accent font-medium text-foreground' : 'text-foreground hover:bg-accent'
                        )}
                      >
                        <span>🏷️</span>
                        <span className="flex-1 truncate">{ctag}</span>
                        {active && <span className="text-primary text-[10px]">✓</span>}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = customTags.filter((t) => t !== ctag);
                          removeCustomTag(ctag);
                          stripTagFromAllEvents(ctag);
                          saveCustomTagsToAPI(next);
                        }}
                        className="shrink-0 flex items-center justify-center w-5 h-5 rounded hover:bg-destructive/15 hover:text-destructive text-muted-foreground/60 transition-colors"
                        title="Remove tag"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
                <div className="my-1 border-t border-border/50" />
                <div className="flex items-center gap-1 px-1 pb-1">
                  <input
                    autoFocus
                    type="text"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        const tag = customTagInput.trim();
                        if (tag) {
                          batchToggleTag(tagTargetIds, tag);
                          const isPreset = PRESET_TAGS.some((p) => p.value === tag);
                          if (!isPreset && !customTags.includes(tag)) {
                            addCustomTag(tag);
                            saveCustomTagsToAPI([...customTags, tag]);
                          }
                          closeHighlightMenu();
                        }
                      }
                    }}
                    placeholder="Custom tag…"
                    className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                  />
                  <button
                    onClick={() => {
                      const tag = customTagInput.trim();
                      if (tag) {
                        batchToggleTag(tagTargetIds, tag);
                        const isPreset = PRESET_TAGS.some((p) => p.value === tag);
                        if (!isPreset && !customTags.includes(tag)) {
                          addCustomTag(tag);
                          saveCustomTagsToAPI([...customTags, tag]);
                        }
                        closeHighlightMenu();
                      }
                    }}
                    className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Add tag"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </>
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
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenSetupWizard={() => setSetupWizardOpen(true)} />

      {/* Print / PDF lightbox */}
      <PrintScheduleModal
        open={printModalOpen}
        onOpenChange={setPrintModalOpen}
        events={events}
        embedInstances={embedInstances}
      />

      {/* WordPress Setup Wizard dialog */}
      <Dialog open={setupWizardOpen} onOpenChange={(open) => {
        setSetupWizardOpen(open);
        if (!open) {
          try { localStorage.setItem('wp_setup_dismissed', 'true'); } catch {}
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">WordPress Setup</DialogTitle>
          <DialogDescription className="sr-only">Connect your WordPress site using the setup wizard.</DialogDescription>
          <WPConnectWizard
            existingConnection={
              wpCallbackSite
                ? { siteUrl: wpCallbackSite, connectedAt: new Date().toISOString() }
                : undefined
            }
            initialError={wpCallbackError}
            onConnected={() => {
              setSetupWizardOpen(false);
              setWpCallbackSite(null);
              setWpCallbackError(null);
              try { localStorage.setItem('wp_setup_dismissed', 'true'); } catch {}
            }}
            onClose={() => {
              setSetupWizardOpen(false);
              setWpCallbackSite(null);
              setWpCallbackError(null);
              try { localStorage.setItem('wp_setup_dismissed', 'true'); } catch {}
            }}
          />
        </DialogContent>
      </Dialog>

      <OrgModal isOpen={orgModalOpen} onClose={() => setOrgModalOpen(false)} onOrgNameChange={name => {
        setOrgName(name);
        // Reload embeds immediately (org members' embeds now included)
        loadEmbedInstances();
        // Apply the saved org timezone before event fetches so schedules
        // use the same timezone shown in Settings on every device.
        fetch('/api/org/creator-settings')
          .then(r => r.ok ? r.json() : null)
          .then(csData => {
            if (csData?.orgTimezone) {
              useTimezoneStore.getState().setTimezone(csData.orgTimezone);
            }
          })
          .catch(() => {});
      }} />
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

      {/* ── Selection-copied toast ─────────────────────────────────────────── */}
      {selectionCopied && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-9999 flex items-center gap-2 rounded-full border border-green-500/30 bg-green-950/90 px-4 py-2 text-xs text-green-400 shadow-lg pointer-events-none">
          <CheckSquare className="w-3.5 h-3.5" />
          Sports selection copied!
        </div>
      )}

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

      {/* AI Match Finder Panel */}
      <MatchFinderPanel
        events={events}
        embedInstances={embedInstances}
        publishTarget={publishTarget}
        username={userUsername}
        onAddMatches={(eventIds, embedTarget, aiRatings) => {
          // ── Batch-select the chosen AI matches ──
          const idSet = new Set(eventIds);

          // If the target embed is different from the current one, switch first
          if (embedTarget !== effectiveTargetRef.current) {
            setPublishTarget(embedTarget);
          }

          // Select them in the store
          batchSetSelected(eventIds, true);

          // Pin new leagues to the top of league order
          const newSportIds = new Set<string>();
          for (const ev of useScheduleStore.getState().events) {
            if (idSet.has(ev.id)) newSportIds.add(ev.sportId);
          }
          if (newSportIds.size > 0) {
            setLeagueOrder((prev) => {
              const additions = Array.from(newSportIds).filter((id) => !prev.includes(id));
              return additions.length > 0 ? [...additions, ...prev] : prev;
            });
          }

          // Persist selection immediately — includes AI importance rating per event
          const allEvents = useScheduleStore.getState().events;
          const selections: SavedSelectionState['selections'] = {};
          for (const e of allEvents) {
            if (e.isSelected || e.isFeatured || e.tags.length > 0) {
              selections[e.id] = {
                isSelected: e.isSelected,
                isFeatured: e.isFeatured,
                tags: e.tags,
                // Preserve existing aiImportance if already set
                ...(aiRatings.has(e.id) ? { aiImportance: aiRatings.get(e.id) } : {}),
              };
            }
          }
          // Force-include AI-selected events with their importance rating
          for (const eid of eventIds) {
            if (!selections[eid]) {
              selections[eid] = {
                isSelected: true,
                isFeatured: false,
                tags: [],
                aiImportance: aiRatings.get(eid),
              };
            } else if (aiRatings.has(eid) && !selections[eid].aiImportance) {
              selections[eid] = { ...selections[eid], aiImportance: aiRatings.get(eid) };
            }
          }
          saveSelectionToSupabase({
            selections,
            leagueOrder,
            featuredLeagues: Object.fromEntries(featuredLeagues),
            savedAt: Date.now(),
          }, embedTarget || effectiveTargetRef.current);
        }}
      />
    </div>
    </MatchFinderProvider>
  );
}
