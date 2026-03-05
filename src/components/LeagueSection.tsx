'use client';

import { memo, useMemo } from 'react';
import { Star, CheckSquare, Square, MinusSquare } from 'lucide-react';
import type { MatchEvent, ScreenTag } from '@/types';
import { getSportConfig } from '@/lib/config';
import MatchCard from '@/components/MatchCard';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LeagueSectionProps {
  sportId: string;
  events: MatchEvent[];
  isLoading?: boolean;
  error?: string | null;
  onToggleSelected: (id: string) => void;
  onToggleFeatured: (id: string) => void;
  onToggleTag: (id: string, tag: ScreenTag) => void;
  isFeaturedLeague?: boolean;
  onToggleFeaturedLeague?: (sportId: string) => void;
  onBulkSelectLeague?: (sportId: string, selectAll: boolean) => void;
}

const LeagueSection = memo(function LeagueSection({
  sportId,
  events,
  isLoading,
  error,
  onToggleSelected,
  onToggleFeatured,
  onToggleTag,
  isFeaturedLeague = false,
  onToggleFeaturedLeague,
  onBulkSelectLeague,
}: LeagueSectionProps) {
  const config = getSportConfig(sportId);

  const { sortedDates, byDate } = useMemo(() => {
    const map = new Map<string, MatchEvent[]>();
    const sorted = [...events].sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return a.time.localeCompare(b.time);
    });
    for (const event of sorted) {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date)!.push(event);
    }
    return { sortedDates: Array.from(map.keys()).sort(), byDate: map };
  }, [events]);

  if (!config) return null;

  return (
    <div className="mb-6">
      {/* League header */}
      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background backdrop-blur-sm py-2 z-10 -mx-3 px-3 sm:-mx-6 sm:px-6 border-b border-border/50">
        {config.logo && (
          <img
            src={config.logo}
            alt={config.label}
            className="w-5 h-5 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        {/* Bulk select toggle */}
        {onBulkSelectLeague && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const allSelected = events.length > 0 && events.every((ev) => ev.isSelected);
              onBulkSelectLeague(sportId, !allSelected);
            }}
            className={cn(
              'transition-colors shrink-0',
              events.length > 0 && events.every((ev) => ev.isSelected)
                ? 'text-primary hover:text-primary/80'
                : events.some((ev) => ev.isSelected)
                  ? 'text-muted-foreground hover:text-primary'
                  : 'text-muted-foreground/30 hover:text-primary'
            )}
            title={
              events.length > 0 && events.every((ev) => ev.isSelected)
                ? 'Deselect all matches'
                : 'Select all matches'
            }
          >
            {events.length > 0 && events.every((ev) => ev.isSelected) ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : events.some((ev) => ev.isSelected) ? (
              <MinusSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        {/* League spotlight star */}
        {onToggleFeaturedLeague && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFeaturedLeague(sportId); }}
            className={cn(
              'transition-colors shrink-0',
              isFeaturedLeague
                ? 'text-yellow-400 hover:text-yellow-300'
                : 'text-muted-foreground/30 hover:text-yellow-400'
            )}
            title={isFeaturedLeague ? 'Remove league spotlight' : 'Spotlight this league in highlights (starred matches only)'}
          >
            <Star className="w-3.5 h-3.5" fill={isFeaturedLeague ? 'currentColor' : 'none'} />
          </button>
        )}
        <h3 className="text-sm font-bold text-foreground">{config.label}</h3>
        <Badge variant="secondary" className="text-[10px] px-2 py-0">
          {events.length} match{events.length !== 1 ? 'es' : ''}
        </Badge>
        {isLoading && (
          <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        )}
        {error && (
          <Badge variant="destructive" className="text-[10px]">
            {error}
          </Badge>
        )}
      </div>

      {/* Events grouped by date */}
      {sortedDates.map((date) => {
        const dayEvents = byDate.get(date)!;
        const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        });

        return (
          <div key={date} className="mb-4">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 pl-1">
              {displayDate}
            </div>
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <MatchCard
                  key={event.id}
                  event={event}
                  onToggleSelected={onToggleSelected}
                  onToggleFeatured={onToggleFeatured}
                  onToggleTag={onToggleTag}
                />
              ))}
            </div>
          </div>
        );
      })}

      {!events.length && !isLoading && (
        <div className="text-xs text-muted-foreground italic py-3 pl-1">
          No matches found for this period.
        </div>
      )}
    </div>
  );
});

export default LeagueSection;
