'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import { Search, X } from 'lucide-react';
import type { MatchEvent } from '@/types';
import { Input } from '@/components/ui/input';

interface SearchFieldProps {
  events: MatchEvent[];
  onFilteredChange: (ids: Set<string> | null) => void;     // null = show all
  placeholder?: string;
}

const FUSE_OPTIONS: IFuseOptions<MatchEvent> = {
  keys: [
    { name: 'home', weight: 0.35 },
    { name: 'away', weight: 0.35 },
    { name: 'leagueLabel', weight: 0.15 },
    { name: 'category', weight: 0.1 },
    { name: 'round', weight: 0.05 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 2,
};

export default function SearchField({
  events,
  onFilteredChange,
  placeholder = 'Search teams, leagues...',
}: SearchFieldProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(() => new Fuse(events, FUSE_OPTIONS), [events]);

  // Update filtered results as user types
  useEffect(() => {
    if (!query.trim()) {
      onFilteredChange(null);
      return;
    }

    const results = fuse.search(query.trim());
    const ids = new Set(results.map(r => r.item.id));
    onFilteredChange(ids);
  }, [query, fuse, onFilteredChange]);

  const handleClear = () => {
    setQuery('');
    onFilteredChange(null);
    inputRef.current?.focus();
  };

  // Keyboard shortcut: Ctrl+K / Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {/* Keyboard shortcut hint */}
      {!query && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded border border-border">
          Ctrl+K
        </kbd>
      )}
    </div>
  );
}
