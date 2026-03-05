'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/lib/themeStore';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = theme;
  }, [theme]);

  // Prevent flash of wrong theme on hydration
  if (!mounted) {
    return (
      <div suppressHydrationWarning style={{ visibility: 'hidden' }}>
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
