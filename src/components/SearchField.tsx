'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import type { MatchEvent } from '@/types';
import { Input } from '@/components/ui/input';

interface SearchFieldProps {
  events: MatchEvent[];
  onFilteredChange: (ids: Set<string> | null) => void;     // null = show all
  placeholder?: string;
}

/** Fast plain-text search — no fuzzy matching, just case-insensitive substring */
function searchEvents(events: MatchEvent[], query: string): Set<string> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return new Set();

  const ids = new Set<string>();
  for (const event of events) {
    // Build a single searchable string per event (cached on first build)
    const haystack = `${event.home} ${event.away} ${event.leagueLabel} ${event.category} ${event.round} ${event.sportId}`.toLowerCase();
    // Every search term must appear somewhere in the haystack
    if (terms.every(term => haystack.includes(term))) {
      ids.add(event.id);
    }
  }
  return ids;
}

export default function SearchField({
  events,
  onFilteredChange,
  placeholder = 'Search teams, leagues...',
}: SearchFieldProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable ref to callback so we don't trigger effect on every render
  const onFilteredChangeRef = useRef(onFilteredChange);

  useEffect(() => {
    onFilteredChangeRef.current = onFilteredChange;
  }, [onFilteredChange]);

  const doSearch = useCallback((q: string, evts: MatchEvent[]) => {
    if (!q.trim()) {
      onFilteredChangeRef.current(null);
      return;
    }
    const ids = searchEvents(evts, q.trim());
    onFilteredChangeRef.current(ids);
  }, []);

  // Debounced search — 120ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, events), 120);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, events, doSearch]);

  const handleClear = () => {
    setQuery('');
    onFilteredChangeRef.current(null);
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
