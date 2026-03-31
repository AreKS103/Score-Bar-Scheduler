'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface MatchFinderContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MatchFinderContext = createContext<MatchFinderContextValue | null>(null);

export function MatchFinderProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(v => !v), []);

  return (
    <MatchFinderContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </MatchFinderContext.Provider>
  );
}

export function useMatchFinder() {
  const ctx = useContext(MatchFinderContext);
  if (!ctx) throw new Error('useMatchFinder must be used inside MatchFinderProvider');
  return ctx;
}
