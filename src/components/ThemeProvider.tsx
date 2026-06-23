'use client';

import { useEffect } from 'react';

/**
 * Syncs theme across browser tabs without subscribing to the Zustand store.
 * Subscribing here previously re-rendered the entire app tree on every toggle,
 * which made dark mode feel very slow.
 *
 * DOM updates happen immediately in themeStore.setTheme / toggleTheme.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'score-theme' || !event.newValue) return;
      try {
        const theme = JSON.parse(event.newValue)?.state?.theme ?? 'light';
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.style.colorScheme = theme;
      } catch {
        // ignore malformed persisted state
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return <>{children}</>;
}
