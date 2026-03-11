'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  loadFromSupabase: () => Promise<void>;
}

let themeSaveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveTheme(theme: Theme) {
  if (themeSaveTimer) clearTimeout(themeSaveTimer);
  themeSaveTimer = setTimeout(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_preferences').upsert({
        user_id: user.id,
        key: 'theme',
        value: { theme },
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[ThemeStore] Failed to save to Supabase:', e);
    }
  }, 500);
}

function applyTheme(theme: Theme) {
  if (typeof window !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        applyTheme(theme);
        debouncedSaveTheme(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        debouncedSaveTheme(next);
        set({ theme: next });
      },
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
            .eq('key', 'theme')
            .single();
          if (data?.value?.theme) {
            const t = data.value.theme as Theme;
            applyTheme(t);
            set({ theme: t });
          }
        } catch (e) {
          console.warn('[ThemeStore] Failed to load from Supabase:', e);
        }
      },
    }),
    { name: 'score-theme' }
  )
);
