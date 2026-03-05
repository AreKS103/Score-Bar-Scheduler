'use client';

import { useState } from 'react';
import { ChevronRight, Globe } from 'lucide-react';
import { getCategories, getLeaguesByCategory, CATEGORY_LOGOS } from '@/lib/config';
import type { MatchEvent } from '@/types';
import { cn } from '@/lib/utils';

interface SportFilterProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  events: MatchEvent[];
}

/** Small inline logo or fallback icon */
function CategoryIcon({ category }: { category: string }) {
  const logoUrl = CATEGORY_LOGOS[category];
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="w-4 h-4 object-contain shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  // Fallback: use a small colored dot
  return <span className="w-4 h-4 shrink-0 rounded-full bg-muted-foreground/20 inline-block" />;
}

export default function SportFilter({
  activeFilter,
  onFilterChange,
  events,
}: SportFilterProps) {
  const categories = getCategories();
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const countByCategory = (cat: string) => {
    if (cat === 'All') return events.length;
    return events.filter((e) => e.category === cat).length;
  };

  const countByLeague = (sportId: string) =>
    events.filter((e) => e.sportId === sportId).length;

  const handleCatClick = (cat: string) => {
    onFilterChange(cat);
    setExpandedCat(expandedCat === cat ? null : cat);
  };

  return (
    <nav className="space-y-0.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-3">
        Sports
      </h3>

      {/* All filter */}
      <button
        onClick={() => { onFilterChange('All'); setExpandedCat(null); }}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all',
          activeFilter === 'All'
            ? 'bg-primary/15 text-primary font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <span className="flex items-center gap-2.5">
          <Globe className="w-4 h-4 shrink-0" />
          <span>All Sports</span>
        </span>
        <span className={cn(
          'text-[11px] px-2 py-0.5 rounded-full',
          activeFilter === 'All'
            ? 'bg-primary/20 text-primary'
            : 'bg-secondary text-muted-foreground'
        )}>
          {countByCategory('All')}
        </span>
      </button>

      {/* Category filters */}
      {categories.map((cat) => {
        const leagues = getLeaguesByCategory(cat);
        const catCount = countByCategory(cat);
        const isActive = activeFilter === cat;
        const isExpanded = expandedCat === cat;

        return (
          <div key={cat}>
            <button
              onClick={() => handleCatClick(cat)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all group',
                isActive
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <CategoryIcon category={cat} />
                <span className="truncate">{cat}</span>
                <ChevronRight className={cn(
                  'w-3 h-3 shrink-0 transition-transform opacity-0 group-hover:opacity-100',
                  isExpanded && 'rotate-90 opacity-100'
                )} />
              </span>
              <span className={cn(
                'text-[11px] px-2 py-0.5 rounded-full shrink-0',
                isActive
                  ? 'bg-primary/20 text-primary'
                  : 'bg-secondary text-muted-foreground'
              )}>
                {catCount}
              </span>
            </button>

            {/* Leagues under expanded category */}
            {isExpanded && (
              <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-3">
                {leagues.map((league) => {
                  const count = countByLeague(league.id);
                  const isLeagueActive = activeFilter === league.id;
                  return (
                    <button
                      key={league.id}
                      onClick={() => onFilterChange(league.id)}
                      className={cn(
                        'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-all gap-1',
                        isLeagueActive
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {league.logo && (
                          <img
                            src={league.logo}
                            alt=""
                            className="w-3.5 h-3.5 object-contain shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <span className="truncate">{league.label}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {count || ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
