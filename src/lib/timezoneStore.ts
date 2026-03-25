'use client';

import { create } from 'zustand';

/** IANA identifier — auto-detect from browser, fallback to UTC */
const DEFAULT_TIMEZONE = typeof window !== 'undefined'
  ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  : 'UTC';
const STORAGE_KEY = 'score-timezone';

export interface TimezoneState {
  timezone: string;
  useLocal: boolean;
  setTimezone: (tz: string) => void;
  setUseLocal: (val: boolean) => void;
}

function loadFromStorage(): { timezone: string; useLocal: boolean } {
  if (typeof window === 'undefined') return { timezone: DEFAULT_TIMEZONE, useLocal: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        timezone: parsed.timezone || DEFAULT_TIMEZONE,
        useLocal: parsed.useLocal !== undefined ? !!parsed.useLocal : true,
      };
    }
  } catch { /* ignore */ }
  // No saved preference — default to user's browser timezone
  return { timezone: DEFAULT_TIMEZONE, useLocal: true };
}

function saveToStorage(state: { timezone: string; useLocal: boolean }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

const initial = loadFromStorage();

export const useTimezoneStore = create<TimezoneState>((set) => ({
  timezone: initial.useLocal ? (Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE) : initial.timezone,
  useLocal: initial.useLocal,

  setTimezone: (tz: string) =>
    set((state) => {
      const next = { ...state, timezone: tz, useLocal: false };
      saveToStorage(next);
      return next;
    }),

  setUseLocal: (val: boolean) =>
    set((state) => {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
      const tz = val ? localTz : DEFAULT_TIMEZONE;
      const next = { ...state, useLocal: val, timezone: tz };
      saveToStorage(next);
      return next;
    }),
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
 * Format an IANA timezone ID for display (e.g. "America/New_York" → "New York").
 */
export function formatTimezoneDisplay(tz: string): string {
  const city = tz.split('/').pop() ?? tz;
  return city.replace(/_/g, ' ');
}
