'use client';

import { memo, useState } from 'react';
import { Star, Tag } from 'lucide-react';
import type { MatchEvent } from '@/types';
import { PRESET_TAGS } from '@/types';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

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
  onToggleTag: (id: string, tag: string) => void;
}

const MatchCard = memo(function MatchCard({
  event,
  onToggleSelected,
  onToggleFeatured,
  onSetNote: _onSetNote,
  onToggleTag,
}: MatchCardProps) {
  const [tagOpen, setTagOpen] = useState(false);
  const isCombat = ['ufc', 'bellator', 'boxing'].includes(event.sportId);
  return (
    <div
      onClick={() => onToggleSelected(event.id)}
      className={cn(
        'group/card flex items-start gap-2 p-2 rounded-lg border transition-all duration-150 cursor-pointer select-none',
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

        {/* Tags row */}
        {(event.tags.length > 0 || event.isSelected) && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {event.tags.map((tag) => {
              const preset = PRESET_TAGS.find((p) => p.value === tag);
              return (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0 h-4 rounded-full border',
                    preset?.color ?? 'bg-secondary text-secondary-foreground border-border'
                  )}
                >
                  {preset?.icon} {tag}
                </span>
              );
            })}
            <Popover open={tagOpen} onOpenChange={setTagOpen}>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); setTagOpen(true); }}
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[9px] px-1.5 h-4 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors',
                    event.tags.length === 0 && 'opacity-0 group-hover/card:opacity-100'
                  )}
                  title="Add tag"
                >
                  <Tag className="w-2.5 h-2.5" />
                  <span className="leading-none">+</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-44 p-2"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">Tags</p>
                <div className="flex flex-col gap-0.5">
                  {PRESET_TAGS.map((preset) => {
                    const active = event.tags.includes(preset.value);
                    return (
                      <button
                        key={preset.value}
                        onClick={() => onToggleTag(event.id, preset.value)}
                        className={cn(
                          'flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors text-left',
                          active
                            ? 'bg-accent font-medium'
                            : 'hover:bg-accent/50'
                        )}
                      >
                        <span>{preset.icon}</span>
                        <span className="flex-1">{preset.value}</span>
                        {active && <span className="text-primary text-[10px]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );
});

export default MatchCard;
