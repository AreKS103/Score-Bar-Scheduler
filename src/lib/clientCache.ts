/**
 * Client-Side LocalStorage Cache
 * 
 * Provides instant display of previously fetched events on page load,
 * then refreshes in the background from the server API.
 */

import type { MatchEvent } from '@/types';

const CACHE_KEY = 'sportglobe_events_cache';
const CACHE_VERSION = 1;

interface CacheData {
  version: number;
  timestamp: number;
  dateRange: { start: string; end: string };
  events: MatchEvent[];
}

/** Get cached events if available and fresh enough */
export function getCachedEvents(dateRange: { start: string; end: string }): MatchEvent[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
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
  events: MatchEvent[]
): void {
  if (typeof window === 'undefined') return;

  try {
    const cache: CacheData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      dateRange,
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

const CUSTOM_EVENTS_KEY = 'sportglobe_custom_events_v1';
const CUSTOM_EVENT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (matches DB default)
const CUSTOM_LEAGUE_LOGOS_KEY = 'sportglobe_custom_league_logos_v1';

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
    const raw = localStorage.getItem(CUSTOM_EVENTS_KEY);
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
    const raw = localStorage.getItem(CUSTOM_LEAGUE_LOGOS_KEY);
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

  const BATCH_SIZE = 3;
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
  return safe ? `sportglobe_selections_v2:${safe}` : 'sportglobe_selections_v2';
}

import type { ScreenTag } from '@/types';

export interface SavedSelectionState {
  /** Map of event ID → selection flags */
  selections: Record<string, { isSelected: boolean; isFeatured: boolean; tags: ScreenTag[] }>;
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
    const raw = localStorage.getItem(selectionsKey(embedTarget));
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

// ─── Supabase Selection Sync ──────────────────────────────────────────────────
// Mirrors selection state to Supabase `user_selections` table for cross-device persistence.

import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

const supabaseSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Save selection state to Supabase (debounced 2s), scoped to embedTarget.
 * Also writes to localStorage immediately via saveSelectionState.
 */
export function saveSelectionToSupabase(state: SavedSelectionState, embedTarget = ''): void {
  // Always save to localStorage first (instant)
  saveSelectionState(state, embedTarget);

  if (!isSupabaseConfigured()) return;
  const existing = supabaseSaveTimers.get(embedTarget);
  if (existing) clearTimeout(existing);
  supabaseSaveTimers.set(embedTarget, setTimeout(async () => {
    supabaseSaveTimers.delete(embedTarget);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('user_selections').upsert({
        user_id: user.id,
        embed_target: embedTarget,
        selections: state.selections,
        league_order: state.leagueOrder,
        featured_leagues: state.featuredLeagues,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,embed_target' });
    } catch (e) {
      console.warn('[SelectionSync] Failed to save to Supabase:', e);
    }
  }, 2000));
}

/**
 * Load selection state from Supabase, scoped to embedTarget. Falls back to localStorage.
 */
export async function loadSelectionFromSupabase(embedTarget = ''): Promise<SavedSelectionState | null> {
  const localState = loadSelectionState(embedTarget);

  // Try Supabase first
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
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
      }
    } catch (e) {
      console.warn('[SelectionSync] Failed to load from Supabase, falling back to localStorage:', e);
    }
  }

  // Fall back to localStorage
  return localState;
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
