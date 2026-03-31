'use client';

import { memo, useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import type { MatchEvent } from '@/types';
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
  onSetNote: (id: string, note: string) => void;
}

const MatchCard = memo(function MatchCard({
  event,
  onToggleSelected,
  onToggleFeatured,
  onSetNote,
}: MatchCardProps) {
  const isCombat = ['ufc', 'bellator', 'boxing'].includes(event.sportId);
  const [localNote, setLocalNote] = useState(event.tags[0] ?? '');

  // Keep local note in sync when the event changes externally
  useEffect(() => {
    setLocalNote(event.tags[0] ?? '');
  }, [event.tags]);

  const handleNoteBlur = () => {
    const note = localNote.trim();
    if (note !== (event.tags[0] ?? '')) {
      onSetNote(event.id, note);
      if (note && !event.isSelected) onToggleSelected(event.id);
    }
  };
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

        {/* Custom note */}
        <div
          className="mt-1.5"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={localNote}
            onChange={(e) => setLocalNote(e.target.value)}
            onBlur={handleNoteBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setLocalNote(event.tags[0] ?? '');
                e.currentTarget.blur();
              }
            }}
            placeholder="Add note…"
            maxLength={100}
            className={cn(
              'w-full text-[10px] px-2 py-0.5 rounded border transition-all bg-transparent',
              localNote
                ? 'border-amber-500/30 text-amber-400/90'
                : 'border-dashed border-border/40 text-muted-foreground/50',
              'placeholder:text-muted-foreground/35 focus:outline-none focus:border-primary/50 focus:text-foreground focus:bg-secondary/30',
            )}
          />
        </div>
      </div>
    </div>
  );
});

export default MatchCard;
