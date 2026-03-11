'use client';

import { create } from 'zustand';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

/** IANA identifier — must use underscore for date-fns-tz */
const DEFAULT_TIMEZONE = 'Asia/Phnom_Penh';
const STORAGE_KEY = 'score-timezone';

export interface TimezoneState {
  timezone: string;
  useLocal: boolean;
  setTimezone: (tz: string) => void;
  setUseLocal: (val: boolean) => void;
  loadFromSupabase: () => Promise<void>;
}

function loadFromStorage(): { timezone: string; useLocal: boolean } {
  if (typeof window === 'undefined') return { timezone: DEFAULT_TIMEZONE, useLocal: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        timezone: parsed.timezone || DEFAULT_TIMEZONE,
        useLocal: !!parsed.useLocal,
      };
    }
  } catch { /* ignore */ }
  return { timezone: DEFAULT_TIMEZONE, useLocal: false };
}

function saveToStorage(state: { timezone: string; useLocal: boolean }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

let tzSaveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveTimezone(state: { timezone: string; useLocal: boolean }) {
  saveToStorage(state);
  if (tzSaveTimer) clearTimeout(tzSaveTimer);
  tzSaveTimer = setTimeout(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_preferences').upsert({
        user_id: user.id,
        key: 'timezone',
        value: { timezone: state.timezone, useLocal: state.useLocal },
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[TimezoneStore] Failed to save to Supabase:', e);
    }
  }, 500);
}

const initial = loadFromStorage();

export const useTimezoneStore = create<TimezoneState>((set) => ({
  timezone: initial.useLocal ? (Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE) : initial.timezone,
  useLocal: initial.useLocal,

  setTimezone: (tz: string) =>
    set((state) => {
      const next = { ...state, timezone: tz, useLocal: false };
      debouncedSaveTimezone(next);
      return next;
    }),

  setUseLocal: (val: boolean) =>
    set((state) => {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
      const tz = val ? localTz : DEFAULT_TIMEZONE;
      const next = { ...state, useLocal: val, timezone: tz };
      debouncedSaveTimezone(next);
      return next;
    }),

  loadFromSupabase: async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('user_preferences')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'timezone')
        .single();
      if (data?.value) {
        const val = data.value as { timezone?: string; useLocal?: boolean };
        const useLocal = !!val.useLocal;
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
        const timezone = useLocal ? localTz : (val.timezone || DEFAULT_TIMEZONE);
        saveToStorage({ timezone, useLocal });
        set({ timezone, useLocal });
      }
    } catch (e) {
      console.warn('[TimezoneStore] Failed to load from Supabase:', e);
    }
  },
}));

/**
 * Get the current active timezone (safe to call outside React).
 */
export function getActiveTimezone(): string {
  try {
    return useTimezoneStore.getState().timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Format an IANA timezone ID for display (e.g. "Asia/Phnom_Penh" → "Phnom Penh").
 */
export function formatTimezoneDisplay(tz: string): string {
  const city = tz.split('/').pop() ?? tz;
  return city.replace(/_/g, ' ');
}
