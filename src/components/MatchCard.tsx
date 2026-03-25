'use client';

import { memo } from 'react';
import { Star } from 'lucide-react';
import type { MatchEvent, ScreenTag } from '@/types';
import { ALL_SCREEN_TAGS } from '@/lib/config';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

/** Convert ISO-3166-1 alpha-2 country code to Unicode flag emoji */
function isoToFlag(code: string): string {
  const c = (code || '').trim().toUpperCase().substring(0, 2);
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return Array.from(c)
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join('');
}

interface MatchCardProps {
  event: MatchEvent;
  onToggleSelected: (id: string) => void;
  onToggleFeatured: (id: string) => void;
  onToggleTag: (id: string, tag: ScreenTag) => void;
}

const MatchCard = memo(function MatchCard({
  event,
  onToggleSelected,
  onToggleFeatured,
  onToggleTag,
}: MatchCardProps) {
  const isCombat = ['ufc', 'bellator', 'boxing'].includes(event.sportId);
  return (
    <div
      onClick={() => onToggleSelected(event.id)}
      className={cn(
        'flex items-start gap-2 p-2 rounded-lg border transition-all duration-150 cursor-pointer select-none',
        event.isSelected
          ? 'bg-card border-border hover:border-ring/40'
          : 'bg-secondary/20 border-border/40 opacity-65 hover:opacity-85'
      )}
    >
      {/* Checkbox */}
      <div className="mt-1 pointer-events-none">
        <Checkbox
          checked={event.isSelected}
          tabIndex={-1}
        />
      </div>

      {/* Star */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFeatured(event.id); }}
        className={cn(
          'mt-0.5 transition-colors p-1.5 -m-1 rounded-md sm:p-0 sm:m-0',
          event.isFeatured
            ? 'text-amber-400 hover:text-amber-300'
            : 'text-muted-foreground/40 hover:text-muted-foreground'
        )}
        title={event.isFeatured ? 'Remove from highlights' : 'Add to highlights'}
      >
        <Star className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill={event.isFeatured ? 'currentColor' : 'none'} />
      </button>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-semibold text-primary whitespace-nowrap">
            {event.time}
          </span>
          <Badge variant="secondary" className="text-[9px] font-medium uppercase px-1.5 py-0 h-4">
            {event.source}
          </Badge>
        </div>

        {/* Teams with logos / fighter flags */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          {event.homeLogo ? (
            <img
              src={event.homeLogo}
              alt=""
              className="h-4 w-4 object-contain flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (isCombat && event.homeCountry) ? (
            <span className="leading-none text-sm" title={event.homeCountry}>
              {isoToFlag(event.homeCountry)}
            </span>
          ) : null}
          <span>{event.home}</span>
          {event.away && (
            <>
              <span className="text-muted-foreground mx-0.5">vs</span>
              {event.awayLogo ? (
                <img
                  src={event.awayLogo}
                  alt=""
                  className="h-4 w-4 object-contain flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (isCombat && event.awayCountry) ? (
                <span className="leading-none text-sm" title={event.awayCountry}>
                  {isoToFlag(event.awayCountry)}
                </span>
              ) : null}
              <span>{event.away}</span>
            </>
          )}
        </div>

        {event.round && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{event.round}</div>
        )}

        {/* Screen tags */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {ALL_SCREEN_TAGS.map((tag) => {
            const isActive = event.tags.includes(tag);
            return (
              <button
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTag(event.id, tag);
                  if (!event.isSelected) onToggleSelected(event.id);
                }}
                className={cn(
                  'text-[11px] sm:text-[10px] px-2.5 sm:px-1.5 py-1 sm:py-0.5 rounded-full border transition-all',
                  isActive
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-transparent border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground/70'
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default MatchCard;
