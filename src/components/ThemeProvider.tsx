'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/themeStore';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  // Keep DOM in sync if the store changes (e.g. from another tab)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return <>{children}</>;
}
