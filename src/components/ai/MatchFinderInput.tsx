'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

const QUICK_FILTERS = [
  'Today',
  'This Week',
  'This Month',
];

interface MatchFinderInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  matchCount: number;
}

export default function MatchFinderInput({ onSubmit, isLoading, matchCount }: MatchFinderInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map(f => (
          <button
            key={f}
            type="button"
            onClick={() => onSubmit(f)}
            disabled={isLoading || matchCount === 0}
            className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
          >
            {f}
          </button>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="default"
        disabled={isLoading || matchCount === 0}
        onClick={() => onSubmit('all')}
        className="w-full h-8 text-xs gap-1.5"
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {isLoading ? 'Analyzing...' : `Analyze ${matchCount} matches`}
      </Button>
    </div>
  );
}
