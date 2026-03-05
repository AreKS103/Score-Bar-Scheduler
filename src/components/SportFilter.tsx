'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Globe, Star } from 'lucide-react';
import { getCategories, getLeaguesByCategory, CATEGORY_LOGOS, SPORTS_CONFIG } from '@/lib/config';
import { useFavoritesStore } from '@/lib/favoritesStore';
import type { MatchEvent } from '@/types';
import { cn } from '@/lib/utils';

interface SportFilterProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  events: MatchEvent[];
}

interface ContextMenuState {
  sportId: string;
  x: number;
  y: number;
}

/** Small inline category logo or fallback dot */
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
  return <span className="w-4 h-4 shrink-0 rounded-full bg-muted-foreground/20 inline-block" />;
}

export default function SportFilter({
  activeFilter,
  onFilterChange,
  events,
}: SportFilterProps) {
  const categories = getCategories();

  // ── Tab + accordion state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab]     = useState<'favorites' | 'all'>('all');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // ── Context menu state ─────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // ── Drag state (Favorites tab only) ───────────────────────────────────────
  const [draggedId, setDraggedId]   = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Favorites store ────────────────────────────────────────────────────────
  const { favoriteOrder, addFavorite, removeFavorite, isFavorite, reorderFavorites } =
    useFavoritesStore();

  // ── Dismiss context menu on outside click / Escape ─────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  // ── Count helpers ──────────────────────────────────────────────────────────
  const countByCategory = (cat: string) =>
    cat === 'All' ? events.length : events.filter((e) => e.category === cat).length;

  const countByLeague = (sportId: string) =>
    events.filter((e) => e.sportId === sportId).length;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleCatClick = (cat: string) => {
    onFilterChange(cat);
    setExpandedCat(expandedCat === cat ? null : cat);
  };

  const openContextMenu = (e: React.MouseEvent, sportId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 210);
    const y = Math.min(e.clientY, window.innerHeight - 90);
    setContextMenu({ sportId, x, y });
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent<HTMLDivElement>, sportId: string) => {
    setDraggedId(sportId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sportId);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>, sportId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (sportId !== draggedId) setDragOverId(sportId);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { resetDrag(); return; }
    const next = [...favoriteOrder];
    const from = next.indexOf(draggedId);
    const to   = next.indexOf(targetId);
    if (from !== -1 && to !== -1) {
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      reorderFavorites(next);
    }
    resetDrag();
  };

  const onDragEnd = () => resetDrag();
  const resetDrag = () => { setDraggedId(null); setDragOverId(null); };

  // ── Build ordered favorites list ───────────────────────────────────────────
  const favoriteSports = favoriteOrder
    .map((id) => SPORTS_CONFIG.find((s) => s.id === id))
    .filter((s): s is (typeof SPORTS_CONFIG)[number] => Boolean(s));

  const favCats = [...new Set(favoriteSports.map((s) => s.category))];

  return (
    <div ref={containerRef} className="relative">
      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-3 px-2">
        <button
          onClick={() => setActiveTab('favorites')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium',
            'transition-all border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            activeTab === 'favorites'
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground border-transparent'
          )}
        >
          <Star className={cn('w-3 h-3', activeTab === 'favorites' && 'fill-amber-400')} />
          Favorites
          {favoriteOrder.length > 0 && (
            <span className="text-[10px] bg-amber-500/25 text-amber-300 px-1.5 py-0.5 rounded-full leading-none">
              {favoriteOrder.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium',
            'transition-all border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            activeTab === 'all'
              ? 'bg-primary/15 text-primary border-primary/30'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground border-transparent'
          )}
        >
          <Globe className="w-3 h-3" />
          All Sports
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          FAVORITES TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'favorites' && (
        <nav aria-label="Favorite leagues">
          {favoriteSports.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Star className="w-7 h-7 text-muted-foreground/25 mx-auto mb-2.5" />
              <p className="text-xs text-muted-foreground/50 leading-relaxed">
                Right-click any league to add it to your favorites
              </p>
            </div>
          ) : (
            favCats.map((cat) => {
              const catSports = favoriteSports.filter((s) => s.category === cat);
              return (
                <div key={cat} className="mb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 px-3 pt-2 pb-0.5">
                    {cat}
                  </p>
                  <div className="space-y-0.5">
                    {catSports.map((league) => {
                      const count        = countByLeague(league.id);
                      const isActive     = activeFilter === league.id;
                      const isDragging   = draggedId === league.id;
                      const isDropTarget = dragOverId === league.id;

                      return (
                        <div key={league.id}>
                          {/* Drop indicator line (appears above target) */}
                          {isDropTarget && (
                            <div className="h-0.5 mx-2 rounded-full bg-primary/70 my-0.5" />
                          )}
                          <div
                            draggable
                            onDragStart={(e) => onDragStart(e, league.id)}
                            onDragOver={(e)  => onDragOver(e, league.id)}
                            onDrop={(e)      => onDrop(e, league.id)}
                            onDragEnd={onDragEnd}
                            onContextMenu={(e) => openContextMenu(e, league.id)}
                            onClick={() => onFilterChange(league.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') onFilterChange(league.id); }}
                            className={cn(
                              'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs',
                              'transition-all duration-150 cursor-grab active:cursor-grabbing select-none',
                              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                              isActive
                                ? 'bg-accent text-foreground font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                              isDragging
                                ? 'opacity-50 rotate-2 scale-[1.03] ring-1 ring-primary/40 shadow-md'
                                : ''
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
                            <span className="flex items-center gap-1.5 shrink-0 ml-2">
                              {count > 0 && (
                                <span className="text-[10px] text-muted-foreground">{count}</span>
                              )}
                              {/* Drag handle hint */}
                              <span className="text-muted-foreground/30 text-[11px] leading-none" aria-hidden>⠿</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </nav>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ALL SPORTS TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'all' && (
        <nav className="space-y-0.5" aria-label="Sports filter">
          {/* All Sports button */}
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

          {/* Category rows */}
          {categories.map((cat) => {
            const leagues    = getLeaguesByCategory(cat);
            const catCount   = countByCategory(cat);
            const isActive   = activeFilter === cat;
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

                {/* League sub-list */}
                {isExpanded && (
                  <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-3">
                    {leagues.map((league) => {
                      const count        = countByLeague(league.id);
                      const isLeagueActive = activeFilter === league.id;
                      const fav          = isFavorite(league.id);

                      return (
                        <div
                          key={league.id}
                          onContextMenu={(e) => openContextMenu(e, league.id)}
                          onClick={() => onFilterChange(league.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter') onFilterChange(league.id); }}
                          className={cn(
                            'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs',
                            'transition-all cursor-default select-none',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
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
                          <span className="flex items-center gap-1 shrink-0 ml-2">
                            {count > 0 && (
                              <span className="text-[10px] text-muted-foreground">{count}</span>
                            )}
                            {fav && (
                              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" aria-label="Favorited" />
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CONTEXT MENU — portaled to body so sidebar overflow can't clip it
      ═══════════════════════════════════════════════════════════════════════ */}
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div
          className={cn(
            'fixed z-9999 min-w-40 rounded-md border border-border',
            'bg-popover shadow-lg py-0.5 overflow-hidden'
          )}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {isFavorite(contextMenu.sportId) ? (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-xs transition-colors text-left"
              onClick={() => {
                removeFavorite(contextMenu.sportId);
                setContextMenu(null);
              }}
            >
              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
              <span>Remove from Favorites</span>
            </button>
          ) : (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-xs transition-colors text-left"
              onClick={() => {
                addFavorite(contextMenu.sportId);
                setContextMenu(null);
              }}
            >
              <Star className="w-3 h-3 text-muted-foreground shrink-0" />
              <span>Add to Favorites</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
