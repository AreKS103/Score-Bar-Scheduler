/**
 * Client-Side LocalStorage Cache
 * 
 * Provides instant display of previously fetched events on page load,
 * then refreshes in the background from the server API.
 */

import type { MatchEvent, ScreenTag } from '@/types';

const CACHE_KEY = 'scorebar_events_cache';
const LEGACY_CACHE_KEY = 'sportglobe_events_cache';
const CACHE_VERSION = 2;

interface CacheData {
  version: number;
  timestamp: number;
  dateRange: { start: string; end: string };
  timeZone: string;
  events: MatchEvent[];
}

/** Get cached events if available and fresh enough */
export function getCachedEvents(dateRange: { start: string; end: string }, timeZone: string): MatchEvent[] | null {
  if (typeof window === 'undefined') return null;

  try {
    let raw = localStorage.getItem(CACHE_KEY);
    // Migrate from legacy key
    if (!raw) {
      raw = localStorage.getItem(LEGACY_CACHE_KEY);
      if (raw) { localStorage.setItem(CACHE_KEY, raw); localStorage.removeItem(LEGACY_CACHE_KEY); }
    }
    if (!raw) return null;

    const cache: CacheData = JSON.parse(raw);

    // Version check
    if (cache.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    // Date range must match
    if (cache.dateRange.start !== dateRange.start || cache.dateRange.end !== dateRange.end) {
      return null;
    }

    if (cache.timeZone !== timeZone) {
      return null;
    }

    // Cache is valid for 15 minutes locally (server cache is 5 min, this is backup)
    const age = Date.now() - cache.timestamp;
    if (age > 15 * 60 * 1000) {
      return null;
    }

    return cache.events;
  } catch (err) {
    console.warn('[ClientCache] Failed to read cache:', err);
    return null;
  }
}

/** Save events to local cache */
export function setCachedEvents(
  dateRange: { start: string; end: string },
  events: MatchEvent[],
  timeZone: string
): void {
  if (typeof window === 'undefined') return;

  try {
    const cache: CacheData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      dateRange,
      timeZone,
      events,
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[ClientCache] Failed to save cache:', err);
    // Storage might be full - clear old data
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
  }
}

/** Append a new event to the existing local cache (e.g. after adding a custom event) */
export function appendCachedEvent(event: MatchEvent): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cache: CacheData = JSON.parse(raw);
    if (cache.version !== CACHE_VERSION) return;
    // Don't add duplicates
    if (cache.events.some(e => e.id === event.id)) return;
    cache.events.push(event);
    cache.timestamp = Date.now(); // refresh TTL
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

/** Remove a single event from local cache by ID. */
export function removeCachedEvent(eventId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cache: CacheData = JSON.parse(raw);
    if (cache.version !== CACHE_VERSION) return;
    cache.events = cache.events.filter((e) => e.id !== eventId);
    cache.timestamp = Date.now();
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

/** Clear the local cache */
export function clearCachedEvents(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

// ─── Local Custom Event Fallback ─────────────────────────────────────────────
// Keeps manual events durable even when Supabase insert fails (missing migration,
// temporary auth issues, RLS misconfig, etc).

const CUSTOM_EVENTS_KEY = 'scorebar_custom_events_v1';
const CUSTOM_EVENT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (matches DB default)
const CUSTOM_LEAGUE_LOGOS_KEY = 'scorebar_custom_league_logos_v1';
const LEGACY_CUSTOM_EVENTS_KEY = 'sportglobe_custom_events_v1';
const LEGACY_CUSTOM_LEAGUE_LOGOS_KEY = 'sportglobe_custom_league_logos_v1';

interface LocalCustomEventsData {
  version: number;
  events: MatchEvent[];
}

interface LocalCustomLeagueLogosData {
  version: number;
  logos: Record<string, string>;
}

function normalizeCustomLeagueKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readLocalCustomEventsStore(): LocalCustomEventsData {
  if (typeof window === 'undefined') return { version: 1, events: [] };
  try {
    let raw = localStorage.getItem(CUSTOM_EVENTS_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_CUSTOM_EVENTS_KEY);
      if (raw) { localStorage.setItem(CUSTOM_EVENTS_KEY, raw); localStorage.removeItem(LEGACY_CUSTOM_EVENTS_KEY); }
    }
    if (!raw) return { version: 1, events: [] };
    const parsed = JSON.parse(raw) as LocalCustomEventsData;
    if (parsed.version !== 1 || !Array.isArray(parsed.events)) {
      return { version: 1, events: [] };
    }
    return parsed;
  } catch {
    return { version: 1, events: [] };
  }
}

function writeLocalCustomEventsStore(events: MatchEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify({ version: 1, events } satisfies LocalCustomEventsData));
  } catch {
    // ignore quota failures; app still works via in-memory state
  }
}

function readLocalCustomLeagueLogosStore(): LocalCustomLeagueLogosData {
  if (typeof window === 'undefined') return { version: 1, logos: {} };
  try {
    let raw = localStorage.getItem(CUSTOM_LEAGUE_LOGOS_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_CUSTOM_LEAGUE_LOGOS_KEY);
      if (raw) { localStorage.setItem(CUSTOM_LEAGUE_LOGOS_KEY, raw); localStorage.removeItem(LEGACY_CUSTOM_LEAGUE_LOGOS_KEY); }
    }
    if (!raw) return { version: 1, logos: {} };
    const parsed = JSON.parse(raw) as LocalCustomLeagueLogosData;
    if (parsed.version !== 1 || typeof parsed.logos !== 'object' || parsed.logos === null) {
      return { version: 1, logos: {} };
    }
    return parsed;
  } catch {
    return { version: 1, logos: {} };
  }
}

function writeLocalCustomLeagueLogosStore(logos: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      CUSTOM_LEAGUE_LOGOS_KEY,
      JSON.stringify({ version: 1, logos } satisfies LocalCustomLeagueLogosData)
    );
  } catch {
    // ignore quota failures; custom event flow can still work without logo persistence
  }
}

export function saveCustomLeagueLogo(leagueLabel: string, logoDataUrl: string): void {
  if (typeof window === 'undefined') return;
  const key = normalizeCustomLeagueKey(leagueLabel);
  if (!key || !logoDataUrl) return;
  const store = readLocalCustomLeagueLogosStore();
  store.logos[key] = logoDataUrl;
  writeLocalCustomLeagueLogosStore(store.logos);
}

export function loadCustomLeagueLogo(leagueLabel: string): string {
  if (typeof window === 'undefined') return '';
  const key = normalizeCustomLeagueKey(leagueLabel);
  if (!key) return '';
  const store = readLocalCustomLeagueLogosStore();
  return store.logos[key] ?? '';
}

/** Persist a custom/manual event locally as fallback durability. */
export function saveLocalCustomEvent(event: MatchEvent): void {
  if (typeof window === 'undefined') return;
  if (event.source !== 'manual') return;

  const store = readLocalCustomEventsStore();
  const now = Date.now();

  // Prune old manual events (older than 14 days by event date)
  const pruned = store.events.filter((e) => {
    if (e.source !== 'manual') return false;
    const ts = Date.parse(`${e.date}T00:00:00Z`);
    return Number.isFinite(ts) && (now - ts) <= CUSTOM_EVENT_TTL_MS;
  });

  const withoutDup = pruned.filter((e) => e.id !== event.id);
  withoutDup.push(event);
  writeLocalCustomEventsStore(withoutDup);
}

/** Load local fallback custom events for a date range (inclusive). */
export function loadLocalCustomEvents(dateRange: { start: string; end: string }): MatchEvent[] {
  const store = readLocalCustomEventsStore();
  return store.events.filter((e) => e.source === 'manual' && e.date >= dateRange.start && e.date <= dateRange.end);
}

/** Remove one locally persisted custom/manual event by MatchEvent.id. */
export function removeLocalCustomEvent(eventId: string): void {
  if (typeof window === 'undefined') return;
  const store = readLocalCustomEventsStore();
  const next = store.events.filter((e) => e.id !== eventId);
  writeLocalCustomEventsStore(next);
}

/**
 * Best-effort sync: pushes locally stored custom events to Supabase via API.
 * Safe to call repeatedly; server POST is idempotent by event_data->>id.
 */
export async function syncLocalCustomEventsToSupabase(): Promise<{ synced: number; failed: number }> {
  if (typeof window === 'undefined') return { synced: 0, failed: 0 };
  const store = readLocalCustomEventsStore();
  if (!store.events.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  const BATCH_SIZE = 25;
  for (let i = 0; i < store.events.length; i += BATCH_SIZE) {
    const batch = store.events.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((event) =>
        fetch('/api/custom-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        })
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.ok) synced++;
      else failed++;
    }
  }

  return { synced, failed };
}

// ─── Selection Persistence ────────────────────────────────────────────────────
// Saves which events are selected/featured/tagged so page refreshes don't lose state.

const SELECTIONS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Return the localStorage key for a given embedTarget ('' = global/all-embeds slot). */
function selectionsKey(embedTarget: string): string {
  const safe = embedTarget.replace(/[^a-zA-Z0-9_#-]/g, '_');
  return safe ? `scorebar_selections_v2:${safe}` : 'scorebar_selections_v2';
}

/** Return the legacy key for migration purposes. */
function legacySelectionsKey(embedTarget: string): string {
  const safe = embedTarget.replace(/[^a-zA-Z0-9_#-]/g, '_');
  return safe ? `sportglobe_selections_v2:${safe}` : 'sportglobe_selections_v2';
}

export interface SavedSelectionState {
  /** Map of event ID → selection flags + optional full-event snapshot for SportsDB events */
  selections: Record<string, { isSelected: boolean; isFeatured: boolean; tags: ScreenTag[]; aiImportance?: string; snapshot?: MatchEvent }>;
  /** Preserved league order from the preview sidebar */
  leagueOrder: string[];
  /** Preserved featured leagues (sportId → label override) */
  featuredLeagues: Record<string, string>;
  savedAt: number;
}

export function saveSelectionState(state: SavedSelectionState, embedTarget = ''): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(selectionsKey(embedTarget), JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

export function loadSelectionState(embedTarget = ''): SavedSelectionState | null {
  if (typeof window === 'undefined') return null;
  try {
    let raw = localStorage.getItem(selectionsKey(embedTarget));
    // Migrate from legacy key
    if (!raw) {
      const legacyKey = legacySelectionsKey(embedTarget);
      raw = localStorage.getItem(legacyKey);
      if (raw) { localStorage.setItem(selectionsKey(embedTarget), raw); localStorage.removeItem(legacyKey); }
    }
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedSelectionState;
    // Expire after 7 days
    if (Date.now() - data.savedAt > SELECTIONS_MAX_AGE_MS) {
      localStorage.removeItem(selectionsKey(embedTarget));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** Remove a single embed's selection state from localStorage. */
export function clearSelectionState(embedTarget: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(selectionsKey(embedTarget));
  } catch { /* ignore */ }
}

/**
 * Tracks which user last wrote selection data into this browser's localStorage.
 * When a different user is detected, all selection keys are purged before any
 * data is read — preventing cross-account selection contamination.
 */
const USER_SCOPE_KEY = 'scorebar_active_user';
const LEGACY_USER_SCOPE_KEY = 'sportglobe_active_user';

/**
 * Compare the authenticated user ID against the one stored in localStorage.
 * If they differ (different account logged in on the same browser), all
 * `scorebar_selections_v2*` keys are removed before any read or write so that
 * User A's selections can never leak into User B's session.
 */
export function checkAndClearIfUserChanged(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    let stored = localStorage.getItem(USER_SCOPE_KEY);
    // Migrate from legacy key
    if (!stored) {
      stored = localStorage.getItem(LEGACY_USER_SCOPE_KEY);
      if (stored) { localStorage.setItem(USER_SCOPE_KEY, stored); localStorage.removeItem(LEGACY_USER_SCOPE_KEY); }
    }
    if (stored === userId) return; // same user — nothing to do
    // Different (or no) user — purge every selection key
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('scorebar_selections_v2') || key?.startsWith('sportglobe_selections_v2')) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(USER_SCOPE_KEY, userId);
    console.log(
      `[Selections] Auth user changed (${stored?.slice(0, 8) ?? 'none'} → ${userId.slice(0, 8)}) —`,
      `cleared ${toRemove.length} local selection key(s) to prevent cross-account contamination.`
    );
  } catch { /* ignore quota/security errors */ }
}

/**
 * Garbage-collect stale selection keys in localStorage.
 * Pass the set of embed IDs that currently exist. Any
 * `scorebar_selections_v2:*` key not in that set is removed.
 * Also removes legacy `sportglobe_selections_v2:*` keys.
 * This prevents recycled sequential embed IDs ("1", "2", …) from
 * inheriting selections left behind by a previously deleted embed.
 */
export function pruneStaleSelectionKeys(liveEmbedIds: Set<string>): void {
  if (typeof window === 'undefined') return;
  const PREFIX = 'scorebar_selections_v2:';
  const LEGACY_PREFIX = 'sportglobe_selections_v2:';
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    // Always remove legacy sportglobe keys
    if (key.startsWith(LEGACY_PREFIX)) { toRemove.push(key); continue; }
    if (!key.startsWith(PREFIX)) continue;
    const embedId = key.slice(PREFIX.length);
    if (!liveEmbedIds.has(embedId)) toRemove.push(key);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  if (toRemove.length > 0) {
    console.log(`[Selections] Pruned ${toRemove.length} stale localStorage selection key(s):`, toRemove);
  }
}

// ─── Supabase Selection Sync ──────────────────────────────────────────────────
// Mirrors selection state to Supabase `user_selections` table for cross-device
// persistence AND real-time multi-device sync.
//
// Architecture (see migration 041):
//  - Writes go through the `apply_user_selection_diff` RPC, which merges only
//    the changed keys server-side via JSONB `(col - removed) || added`.
//    Concurrent edits from two devices on the same account targeting DIFFERENT
//    event ids no longer clobber each other (the old whole-blob upsert did).
//  - Each tab has a sessionStorage `client_id` so it can ignore its own writes
//    coming back over the realtime channel (echo suppression).
//  - `lastRemoteSnapshots` holds the last successfully-saved or remotely-
//    observed state per embedTarget — used to compute the diff to send.

import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

const supabaseSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Snapshot of what the server is believed to currently hold for each embed. */
const lastRemoteSnapshots = new Map<string, SavedSelectionState>();

const CLIENT_ID_KEY = 'scorebar_client_id';

/** Stable per-tab UUID used to suppress our own realtime echoes. */
export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      sessionStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Record a snapshot as authoritative for future diff computations. */
export function setLastRemoteSnapshot(embedTarget: string, state: SavedSelectionState): void {
  lastRemoteSnapshots.set(embedTarget, {
    selections: { ...state.selections },
    leagueOrder: [...state.leagueOrder],
    featuredLeagues: { ...state.featuredLeagues },
    savedAt: state.savedAt,
  });
}

/** Compute per-key diffs between two record-of-objects (selections / featured_leagues). */
function diffRecord<T>(
  prev: Record<string, T>,
  next: Record<string, T>
): { set: Record<string, T>; rm: string[] } {
  const set: Record<string, T> = {};
  const rm: string[] = [];
  for (const [k, v] of Object.entries(next)) {
    if (!Object.prototype.hasOwnProperty.call(prev, k) || JSON.stringify(prev[k]) !== JSON.stringify(v)) {
      set[k] = v;
    }
  }
  for (const k of Object.keys(prev)) {
    if (!Object.prototype.hasOwnProperty.call(next, k)) rm.push(k);
  }
  return { set, rm };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Save selection state to Supabase (debounced), scoped to embedTarget.
 * Also writes to localStorage immediately via saveSelectionState.
 *
 * Uses the `apply_user_selection_diff` RPC so only changed keys are sent and
 * concurrent edits from other devices targeting other keys are preserved.
 */
export function saveSelectionToSupabase(state: SavedSelectionState, embedTarget = ''): void {
  // Always save to localStorage first (instant)
  saveSelectionState(state, embedTarget);

  if (!isSupabaseConfigured()) return;
  const existing = supabaseSaveTimers.get(embedTarget);
  if (existing) clearTimeout(existing);
  // 80 ms — batches rapid clicks but flushes fast so remote tabs see edits
  // within ~1s end-to-end (outer page debounce 250 ms + this 80 ms + RTT).
  supabaseSaveTimers.set(embedTarget, setTimeout(async () => {
    supabaseSaveTimers.delete(embedTarget);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Guard: ensure localStorage is scoped to this user before writing
      checkAndClearIfUserChanged(user.id);

      // Empty state → delete row so we don't accumulate stale empties.
      if (
        Object.keys(state.selections).length === 0 &&
        Object.keys(state.featuredLeagues).length === 0 &&
        state.leagueOrder.length === 0
      ) {
        const clientId = getClientId();
        await supabase
          .from('user_selections')
          .update({ client_id: clientId })
          .eq('user_id', user.id)
          .eq('embed_target', embedTarget);
        await supabase
          .from('user_selections')
          .delete()
          .eq('user_id', user.id)
          .eq('embed_target', embedTarget);
        lastRemoteSnapshots.delete(embedTarget);
        return;
      }

      const prev = lastRemoteSnapshots.get(embedTarget) ?? {
        selections: {},
        leagueOrder: [],
        featuredLeagues: {},
        savedAt: 0,
      };

      const selDiff = diffRecord(prev.selections, state.selections);
      const featDiff = diffRecord(prev.featuredLeagues, state.featuredLeagues);
      const orderChanged = !arraysEqual(prev.leagueOrder, state.leagueOrder);

      if (selDiff.rm.length > 0 || Object.keys(selDiff.set).length > 0 || orderChanged) {
        const prevCount = Object.values(prev.selections).filter((s) => s.isSelected || s.isFeatured || s.tags.length > 0).length;
        const nextCount = Object.values(state.selections).filter((s) => s.isSelected || s.isFeatured || s.tags.length > 0).length;
        const setCount = Object.keys(selDiff.set).length;
        const message = `[SelectionSync] diff save embed=${embedTarget || '(default)'} prev=${prevCount} next=${nextCount} set=${setCount} rm=${selDiff.rm.length} orderChanged=${orderChanged}`;
        if (selDiff.rm.length > 0 && setCount === 0) {
          console.warn(message, { removed: selDiff.rm.slice(0, 12), clientId: getClientId() });
        } else {
          console.log(message);
        }
      }

      // Nothing actually changed since last known remote — skip the round trip.
      if (
        Object.keys(selDiff.set).length === 0 &&
        selDiff.rm.length === 0 &&
        Object.keys(featDiff.set).length === 0 &&
        featDiff.rm.length === 0 &&
        !orderChanged
      ) {
        return;
      }

      const { data, error } = await supabase.rpc('apply_user_selection_diff', {
        p_embed_target: embedTarget,
        p_selections_set: selDiff.set,
        p_selections_rm: selDiff.rm,
        p_featured_set: featDiff.set,
        p_featured_rm: featDiff.rm,
        p_league_order: orderChanged ? state.leagueOrder : null,
        p_client_id: getClientId(),
      });

      if (error) throw error;

      // Update snapshot from the authoritative server response so the next diff
      // is computed against what the database actually holds (including merges
      // from concurrent edits by other devices).
      if (data) {
        setLastRemoteSnapshot(embedTarget, {
          selections: (data as { selections?: SavedSelectionState['selections'] }).selections ?? {},
          leagueOrder: (data as { league_order?: string[] }).league_order ?? [],
          featuredLeagues: (data as { featured_leagues?: Record<string, string> }).featured_leagues ?? {},
          savedAt: new Date((data as { updated_at?: string }).updated_at ?? Date.now()).getTime(),
        });
      }
    } catch (e) {
      console.warn('[SelectionSync] Failed to save to Supabase:', e);
    }
  }, 80));
}

/**
 * Load selection state from Supabase, scoped to embedTarget. Falls back to localStorage.
 *
 * IMPORTANT: We get the authenticated user ID FIRST, then call
 * checkAndClearIfUserChanged BEFORE reading localStorage. This guarantees that
 * if a different account is logged in on the same browser, the previous user's
 * cached selections are wiped before they can contaminate the new session.
 */
export async function loadSelectionFromSupabase(embedTarget = ''): Promise<SavedSelectionState | null> {
  // Try Supabase first — must resolve user BEFORE reading localStorage
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Guard: wipe cross-account contamination before ANY localStorage read
        checkAndClearIfUserChanged(user.id);

        const localState = loadSelectionState(embedTarget);

        const { data } = await supabase
          .from('user_selections')
          .select('selections, league_order, featured_leagues, updated_at')
          .eq('user_id', user.id)
          .eq('embed_target', embedTarget)
          .maybeSingle();

        if (data) {
          const remoteState: SavedSelectionState = {
            selections: data.selections ?? {},
            leagueOrder: data.league_order ?? [],
            featuredLeagues: data.featured_leagues ?? {},
            savedAt: new Date(data.updated_at).getTime(),
          };

          // Record the server's authoritative state so future writes diff
          // against it (not against an empty starting point).
          setLastRemoteSnapshot(embedTarget, remoteState);

          // If local is newer, keep it. This prevents stale remote rows from
          // wiping freshly-added custom selections when Supabase save failed.
          if (localState && localState.savedAt >= remoteState.savedAt) {
            return localState;
          }

          // Otherwise merge to preserve local-only event IDs (e.g. manual events
          // that failed remote insert) while still taking the newer remote base.
          const merged: SavedSelectionState = {
            selections: {
              ...remoteState.selections,
              ...(localState?.selections ?? {}),
            },
            leagueOrder: localState?.leagueOrder?.length
              ? localState.leagueOrder
              : remoteState.leagueOrder,
            featuredLeagues: {
              ...remoteState.featuredLeagues,
              ...(localState?.featuredLeagues ?? {}),
            },
            savedAt: Math.max(remoteState.savedAt, localState?.savedAt ?? 0),
          };

          // Sync merged view to localStorage
          saveSelectionState(merged, embedTarget);
          return merged;
        }

        // Supabase has no row for this embed — clear the snapshot too so the
        // next write is treated as a fresh insert.
        lastRemoteSnapshots.delete(embedTarget);
        return localState;
      }
    } catch (e) {
      console.warn('[SelectionSync] Failed to load from Supabase, falling back to localStorage:', e);
    }
  }

  // Supabase not configured — read localStorage directly (no user to verify against)
  return loadSelectionState(embedTarget);
}

/** Get cache metadata without loading full data */
export function getCacheInfo(): { age: number; eventCount: number } | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cache: CacheData = JSON.parse(raw);
    return {
      age: Math.round((Date.now() - cache.timestamp) / 1000),
      eventCount: cache.events.length,
    };
  } catch {
    return null;
  }
}
