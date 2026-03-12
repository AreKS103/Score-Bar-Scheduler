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

/** Clear the local cache */
export function clearCachedEvents(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

// ─── Selection Persistence ────────────────────────────────────────────────────
// Saves which events are selected/featured/tagged so page refreshes don't lose state.

const SELECTIONS_KEY = 'sportglobe_selections_v1';
const SELECTIONS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

export function saveSelectionState(state: SavedSelectionState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SELECTIONS_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

export function loadSelectionState(): SavedSelectionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SELECTIONS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedSelectionState;
    // Expire after 7 days
    if (Date.now() - data.savedAt > SELECTIONS_MAX_AGE_MS) {
      localStorage.removeItem(SELECTIONS_KEY);
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

let supabaseSaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save selection state to Supabase (debounced 2s).
 * Also writes to localStorage immediately via saveSelectionState.
 */
export function saveSelectionToSupabase(state: SavedSelectionState): void {
  // Always save to localStorage first (instant)
  saveSelectionState(state);

  if (!isSupabaseConfigured()) return;
  if (supabaseSaveTimer) clearTimeout(supabaseSaveTimer);
  supabaseSaveTimer = setTimeout(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('user_selections').upsert({
        user_id: user.id,
        selections: state.selections,
        league_order: state.leagueOrder,
        featured_leagues: state.featuredLeagues,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[SelectionSync] Failed to save to Supabase:', e);
    }
  }, 2000);
}

/**
 * Load selection state from Supabase. Falls back to localStorage.
 */
export async function loadSelectionFromSupabase(): Promise<SavedSelectionState | null> {
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
          .single();

        if (data) {
          const state: SavedSelectionState = {
            selections: data.selections ?? {},
            leagueOrder: data.league_order ?? [],
            featuredLeagues: data.featured_leagues ?? {},
            savedAt: new Date(data.updated_at).getTime(),
          };
          // Sync to localStorage too
          saveSelectionState(state);
          return state;
        }
      }
    } catch (e) {
      console.warn('[SelectionSync] Failed to load from Supabase, falling back to localStorage:', e);
    }
  }

  // Fall back to localStorage
  return loadSelectionState();
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
