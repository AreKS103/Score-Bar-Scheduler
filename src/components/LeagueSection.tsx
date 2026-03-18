'use client';

import { memo, useMemo, useState } from 'react';
import { Star, CheckSquare, Square, MinusSquare, ChevronDown, ChevronRight } from 'lucide-react';
import type { MatchEvent, ScreenTag } from '@/types';
import { getSportConfig } from '@/lib/config';
import MatchCard from '@/components/MatchCard';
import SmartLogo from '@/components/ui/SmartLogo';
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

/** Groups MMA/boxing fights by cardName into { main, undercards } */
function groupFightCard(events: MatchEvent[]): { main: MatchEvent; undercards: MatchEvent[] }[] {
  const cardMap = new Map<string, MatchEvent[]>();
  const nonCardEvents: MatchEvent[] = [];

  for (const ev of events) {
    if (ev.cardName) {
      if (!cardMap.has(ev.cardName)) cardMap.set(ev.cardName, []);
      cardMap.get(ev.cardName)!.push(ev);
    } else {
      nonCardEvents.push(ev);
    }
  }

  const cards: { main: MatchEvent; undercards: MatchEvent[] }[] = [];
  for (const [, fights] of cardMap) {
    // Sort by fightOrder — 0 = main event first
    fights.sort((a, b) => (a.fightOrder ?? 0) - (b.fightOrder ?? 0));
    const main = fights[0];
    const undercards = fights.slice(1);
    cards.push({ main, undercards });
  }

  // Non-card events become standalone entries
  for (const ev of nonCardEvents) {
    cards.push({ main: ev, undercards: [] });
  }

  return cards;
}

/** Sub-component: renders a fight card with expandable undercards */
const FightCardGroup = memo(function FightCardGroup({
  main,
  undercards,
  onToggleSelected,
  onToggleFeatured,
  onToggleTag,
}: {
  main: MatchEvent;
  undercards: MatchEvent[];
  onToggleSelected: (id: string) => void;
  onToggleFeatured: (id: string) => void;
  onToggleTag: (id: string, tag: ScreenTag) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (undercards.length === 0) {
    return (
      <MatchCard
        event={main}
        onToggleSelected={onToggleSelected}
        onToggleFeatured={onToggleFeatured}
        onToggleTag={onToggleTag}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      {/* Main event */}
      <MatchCard
        event={main}
        onToggleSelected={onToggleSelected}
        onToggleFeatured={onToggleFeatured}
        onToggleTag={onToggleTag}
      />
      {/* Undercard toggle */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground bg-secondary/30 border-t border-border/40 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {(() => {
          const mainCount = undercards.filter(f => f.isMainCard).length;
          const prelimCount = undercards.filter(f => !f.isMainCard).length;
          if (mainCount > 0 && prelimCount > 0) return `${mainCount} main card • ${prelimCount} prelim bout${prelimCount !== 1 ? 's' : ''}`;
          return `${undercards.length} undercard bout${undercards.length !== 1 ? 's' : ''}`;
        })()}
      </button>
      {/* Undercard fights — main card bouts first, then prelims with separator */}
      {expanded && (() => {
        const mainCardUndercards = undercards.filter(f => f.isMainCard);
        const prelimUndercards = undercards.filter(f => !f.isMainCard);
        return (
          <div className="pl-4 pr-1 py-1 space-y-1 bg-secondary/10 border-t border-border/30">
            {mainCardUndercards.map(fight => (
              <MatchCard
                key={fight.id}
                event={fight}
                onToggleSelected={onToggleSelected}
                onToggleFeatured={onToggleFeatured}
                onToggleTag={onToggleTag}
              />
            ))}
            {mainCardUndercards.length > 0 && prelimUndercards.length > 0 && (
              <div className="py-1 pl-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">— Prelims</span>
              </div>
            )}
            {prelimUndercards.map(fight => (
              <MatchCard
                key={fight.id}
                event={fight}
                onToggleSelected={onToggleSelected}
                onToggleFeatured={onToggleFeatured}
                onToggleTag={onToggleTag}
              />
            ))}
          </div>
        );
      })()}
    </div>
  );
}, (prev, next) => {
  if (prev.main !== next.main) return false;
  if (prev.undercards.length !== next.undercards.length) return false;
  for (let i = 0; i < prev.undercards.length; i++) {
    if (prev.undercards[i] !== next.undercards[i]) return false;
  }
  return true;
});

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

  // Detect if this league contains fight card events (MMA/boxing)
  const isFightSport = useMemo(
    () => events.some(e => e.cardName != null),
    [events]
  );

  const allSelected = useMemo(
    () => events.length > 0 && events.every((ev) => ev.isSelected),
    [events]
  );

  const someSelected = useMemo(
    () => events.some((ev) => ev.isSelected),
    [events]
  );

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
    return { sortedDates: Array.from(map.keys()), byDate: map };
  }, [events]);

  const fightCardsByDate = useMemo(() => {
    if (!isFightSport) return new Map<string, { main: MatchEvent; undercards: MatchEvent[] }[]>();
    const grouped = new Map<string, { main: MatchEvent; undercards: MatchEvent[] }[]>();
    for (const date of sortedDates) {
      const dayEvents = byDate.get(date) ?? [];
      grouped.set(date, groupFightCard(dayEvents));
    }
    return grouped;
  }, [isFightSport, sortedDates, byDate]);

  if (!config) return null;

  return (
    <div className="mb-6 animate-league-flash">
      {/* League header */}
      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background backdrop-blur-sm py-2 z-10 -mx-3 px-3 sm:-mx-6 sm:px-6 border-b border-border/50">
        {config.logo && (
          <SmartLogo
            logo={config.logo}
            publishLogo={config.publishLogo}
            alt={config.label}
            className="w-5 h-5 object-contain"
          />
        )}
        {/* Bulk select toggle */}
        {onBulkSelectLeague && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBulkSelectLeague(sportId, !allSelected);
            }}
            className={cn(
              'transition-colors shrink-0',
              allSelected
                ? 'text-primary hover:text-primary/80'
                : someSelected
                  ? 'text-muted-foreground hover:text-primary'
                  : 'text-muted-foreground/30 hover:text-primary'
            )}
            title={
              allSelected
                ? 'Deselect all matches'
                : 'Select all matches'
            }
          >
            {allSelected ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : someSelected ? (
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
              {isFightSport
                ? (fightCardsByDate.get(date) ?? []).map(({ main, undercards }) => (
                    <FightCardGroup
                      key={main.id}
                      main={main}
                      undercards={undercards}
                      onToggleSelected={onToggleSelected}
                      onToggleFeatured={onToggleFeatured}
                      onToggleTag={onToggleTag}
                    />
                  ))
                : dayEvents.map((event) => (
                    <MatchCard
                      key={event.id}
                      event={event}
                      onToggleSelected={onToggleSelected}
                      onToggleFeatured={onToggleFeatured}
                      onToggleTag={onToggleTag}
                    />
                  ))
              }
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
}, (prev, next) => {
  if (prev.sportId !== next.sportId) return false;
  if (prev.isLoading !== next.isLoading) return false;
  if (prev.error !== next.error) return false;
  if (prev.isFeaturedLeague !== next.isFeaturedLeague) return false;
  if (prev.events.length !== next.events.length) return false;
  for (let i = 0; i < prev.events.length; i++) {
    if (prev.events[i] !== next.events[i]) return false;
  }
  return true;
});

export default LeagueSection;
