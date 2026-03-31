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

/* Known rivalries (lowercase). Order-independent — both directions matched. */
const RIVALRIES: [string, string, string][] = [
  ['real madrid', 'barcelona', 'El Clásico'],
  ['arsenal', 'tottenham', 'North London Derby'],
  ['liverpool', 'manchester united', 'Northwest Derby'],
  ['liverpool', 'everton', 'Merseyside Derby'],
  ['manchester united', 'manchester city', 'Manchester Derby'],
  ['ac milan', 'inter', 'Derby della Madonnina'],
  ['roma', 'lazio', 'Derby della Capitale'],
  ['celtic', 'rangers', 'Old Firm'],
  ['boca juniors', 'river plate', 'Superclásico'],
  ['galatasaray', 'fenerbahce', 'Intercontinental Derby'],
  ['ajax', 'feyenoord', 'De Klassieker'],
  ['borussia dortmund', 'bayern munich', 'Der Klassiker'],
  ['al ahly', 'zamalek', 'Cairo Derby'],
  ['olympiacos', 'panathinaikos', 'Derby of the Eternal Enemies'],
  ['bengals', 'ravens', 'AFC North Rivalry'],
  ['packers', 'bears', 'NFL Oldest Rivalry'],
  ['cowboys', 'eagles', 'NFC East Rivalry'],
  ['lakers', 'celtics', 'NBA Greatest Rivalry'],
  ['yankees', 'red sox', 'MLB Greatest Rivalry'],
  ['dodgers', 'giants', 'Freeway/Bay Rivalry'],
];

const ROUND_KEYWORDS = [
  { pattern: /\bfinal\b/i, reason: 'Championship final' },
  { pattern: /\bsemi.?final\b/i, reason: 'Semifinal stage' },
  { pattern: /\bquarter.?final\b/i, reason: 'Quarterfinal stage' },
  { pattern: /\bplayoff\b/i, reason: 'Playoff game' },
  { pattern: /\bknockout\b/i, reason: 'Knockout round' },
  { pattern: /\btitle\s*(fight|bout)\b/i, reason: 'Title fight' },
  { pattern: /\bchampionship\b/i, reason: 'Championship round' },
  { pattern: /\bgrand\s*prix\b/i, reason: 'Grand Prix race' },
];

const ALWAYS_SHOW_CATEGORIES = new Set(['Motorsport', 'Boxing', 'MMA', 'Cycling']);

function getMatchReason(event: MatchEvent, importance: MatchRating['importance']): string {
  const reasons: string[] = [];

  // Check rivalry
  const h = (event.home || '').toLowerCase();
  const a = (event.away || '').toLowerCase();
  for (const [t1, t2, name] of RIVALRIES) {
    if ((h.includes(t1) && a.includes(t2)) || (h.includes(t2) && a.includes(t1))) {
      reasons.push(name);
      break;
    }
  }

  // Check round keywords
  const round = event.round || '';
  for (const { pattern, reason } of ROUND_KEYWORDS) {
    if (pattern.test(round) || pattern.test(event.home || '')) {
      reasons.push(reason);
      break;
    }
  }

  // Always-show category
  if (ALWAYS_SHOW_CATEGORIES.has(event.category || '')) {
    reasons.push('Every race/fight matters');
  }

  // Fallback
  if (reasons.length === 0) {
    switch (importance) {
      case 'must_watch': reasons.push('Top-tier matchup'); break;
      case 'high': reasons.push('Strong matchup worth watching'); break;
      case 'medium': reasons.push('Solid option for the lineup'); break;
      case 'low': reasons.push('Background/filler option'); break;
    }
  }

  return reasons.join(' · ');
}

interface AIMatchCardProps {
  event: MatchEvent;
  importance: MatchRating['importance'];
  isSelected: boolean;
  onToggle: (id: string) => void;
}

const AIMatchCard = memo(function AIMatchCard({ event, importance, isSelected, onToggle }: AIMatchCardProps) {
  const style = IMPORTANCE_STYLES[importance];
  const reason = getMatchReason(event, importance);

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
          <span
            className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold cursor-help', style.bg, style.text)}
            title={`Why this match? ${reason}`}
          >
            {style.label}
          </span>
        </div>

        {/* Reason */}
        <p className="text-[9px] text-muted-foreground/70 -mt-0.5 mb-1 italic truncate">{reason}</p>

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
