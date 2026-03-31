'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import type { MatchEvent } from '@/types';
import type { MatchRating } from '@/lib/ai/schemas';

const IMPORTANCE_STYLES: Record<MatchRating['importance'], { bg: string; text: string; label: string }> = {
  must_watch: { bg: 'bg-red-500/15', text: 'text-red-600 dark:text-red-400', label: 'Must Watch' },
  high: { bg: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400', label: 'High' },
  medium: { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', label: 'Medium' },
  low: { bg: 'bg-gray-500/15', text: 'text-gray-600 dark:text-gray-400', label: 'Low' },
};

interface AIMatchCardProps {
  event: MatchEvent;
  importance: MatchRating['importance'];
  isSelected: boolean;
  onToggle: (id: string) => void;
}

const AIMatchCard = memo(function AIMatchCard({ event, importance, isSelected, onToggle }: AIMatchCardProps) {
  const style = IMPORTANCE_STYLES[importance];

  return (
    <div
      onClick={() => onToggle(event.id)}
      className={cn(
        'flex items-start gap-2 p-2 rounded-lg border transition-all duration-150 cursor-pointer select-none',
        isSelected
          ? 'bg-card border-border hover:border-ring/40'
          : 'bg-secondary/20 border-border/40 opacity-65 hover:opacity-85'
      )}
    >
      {/* Checkbox */}
      <div className="mt-1 pointer-events-none">
        <Checkbox checked={isSelected} tabIndex={-1} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-semibold text-primary whitespace-nowrap">
            {event.time}
          </span>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', style.bg, style.text)}>
            {style.label}
          </span>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          {event.homeLogo && (
            <img
              src={event.homeLogo}
              alt=""
              className="h-4 w-4 object-contain shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span>{event.home}</span>
          {event.away && (
            <>
              <span className="text-muted-foreground mx-0.5">vs</span>
              {event.awayLogo && (
                <img
                  src={event.awayLogo}
                  alt=""
                  className="h-4 w-4 object-contain shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span>{event.away}</span>
            </>
          )}
        </div>

        {event.round && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{event.round}</div>
        )}
      </div>
    </div>
  );
});

export default AIMatchCard;
