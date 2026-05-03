'use client';

import { useRef, useMemo, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CATEGORY_ORDER } from '@/lib/config';
import { formatDisplayDate } from '@/lib/timezone';
import { formatTimezoneDisplay, useTimezoneStore } from '@/lib/timezoneStore';
import type { MatchEvent } from '@/types';

/* ── helpers ─────────────────────────────────────────────────────────── */

function categorySort(cat: string): number {
  const idx = CATEGORY_ORDER.indexOf(cat);
  return idx === -1 ? 999 : idx;
}

/** Group selected events by category -> league -> date */
function groupForPrint(events: MatchEvent[]) {
  const categories = new Map<string, Map<string, { logo: string; dates: Map<string, MatchEvent[]> }>>();
  
  for (const e of events) {
    if (!e.isSelected) continue;
    if (!categories.has(e.category)) {
      categories.set(e.category, new Map());
    }
    const leaguesMap = categories.get(e.category)!;
    
    if (!leaguesMap.has(e.leagueLabel)) {
      leaguesMap.set(e.leagueLabel, { logo: e.leagueLogo, dates: new Map() });
    }
    const datesMap = leaguesMap.get(e.leagueLabel)!.dates;
    
    if (!datesMap.has(e.date)) {
      datesMap.set(e.date, []);
    }
    datesMap.get(e.date)!.push(e);
  }

  return [...categories.entries()]
    .sort(([catA], [catB]) => categorySort(catA) - categorySort(catB))
    .map(([category, leaguesMap]) => ({
      category,
      leagues: [...leaguesMap.entries()]
        .sort(([leagueA], [leagueB]) => leagueA.localeCompare(leagueB))
        .map(([league, { logo, dates }]) => ({
          league,
          logo,
          dates: [...dates.entries()]
            .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
            .map(([date, items]) => ({
              date,
              items: items.sort((a, b) => a.time.localeCompare(b.time))
            }))
        }))
    }));
}

/** Get unique dates from events */
function getDateRange(events: MatchEvent[]): string {
  const dates = new Set<string>();
  for (const e of events) {
    if (e.isSelected) dates.add(e.date);
  }
  const sorted = [...dates].sort();
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return formatDisplayDate(sorted[0]);
  return `${formatDisplayDate(sorted[0])} – ${formatDisplayDate(sorted[sorted.length - 1])}`;
}

function getMatchLabel(event: MatchEvent): string {
  return event.away ? `${event.home} vs ${event.away}` : event.home;
}

function getNotesLabel(event: MatchEvent): string {
  return event.tags.length > 0 ? event.tags.join('; ') : '';
}

function getPrintSectionId(league: string): string {
  return `print-league-${league.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/* ── inline styles for print (no Tailwind in print iframe) ───────── */

const S = {
  page: { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', backgroundColor: '#fff', color: '#111', padding: '24px', fontSize: '13px', lineHeight: '1.5' } as const,
  title: { fontSize: '18px', fontWeight: 700, marginBottom: '4px', color: '#000' } as const,
  subtitle: { fontSize: '12px', color: '#555', marginBottom: '16px' } as const,
  meta: { display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 12px', fontSize: '11px', color: '#555', marginBottom: '24px' } as const,
  metaLabel: { fontWeight: 700, color: '#222' } as const,
  
  categoryContainer: { marginBottom: '32px' } as const,
  categoryHeader: { fontSize: '18px', fontWeight: 800, margin: '0 0 24px 0', color: '#000' } as const,
  
  league: { marginBottom: '24px', breakInside: 'avoid' as const } as const,
  leagueHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' } as const,
  leagueLogo: { height: '24px', width: '24px', objectFit: 'contain' as const, flexShrink: 0 } as const,
  leagueName: { fontSize: '18px', fontWeight: 700, color: '#000' } as const,
  
  dateHeader: { fontSize: '11px', fontWeight: 600, color: '#555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '16px 0 8px', borderBottom: '1px solid #ddd', paddingBottom: '4px' } as const,
  
  matchRow: { display: 'flex', alignItems: 'baseline', padding: '4px 0', gap: '12px' } as const,
  time: { fontWeight: 700, color: '#000', width: '45px', flexShrink: 0, fontVariantNumeric: 'tabular-nums' as const } as const,
  matchInfo: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: '6px' } as const,
  home: { fontWeight: 500, color: '#111' } as const,
  away: { fontWeight: 500, color: '#111' } as const,
  vs: { fontSize: '11px', color: '#666', fontStyle: 'italic' as const } as const,
  notes: { fontSize: '12px', color: '#666' } as const,
} as const;

/* ── component ───────────────────────────────────────────────────── */

interface PrintScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: MatchEvent[];
  embedInstances: { display_id: string; embed_id: string | null }[];
}

export default function PrintScheduleModal({
  open,
  onOpenChange,
  events,
  embedInstances,
}: PrintScheduleModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedEmbed, setSelectedEmbed] = useState('all');
  const [copied, setCopied] = useState(false);
  const timezone = useTimezoneStore((state) => state.timezone);

  const selectedEvents = useMemo(() => {
    if (selectedEmbed === 'all') return events;
    // Filter is cosmetic — all embeds share the same event list; selection state is embed-specific
    // Since we receive the events for the current view, just use them directly
    return events;
  }, [events, selectedEmbed]);

  const groups = useMemo(() => groupForPrint(selectedEvents), [selectedEvents]);
  const dateRange = useMemo(() => getDateRange(selectedEvents), [selectedEvents]);
  const selectedCount = useMemo(() => selectedEvents.filter(e => e.isSelected).length, [selectedEvents]);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: () => `Schedule_${dateRange.replace(/\s/g, '_')}`,
    pageStyle: `
      @page { size: A4; margin: 15mm; }
      @media print {
        html, body { height: 100%; margin: 0; padding: 0; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `,
  });

  const handleCopyText = async () => {
    let text = `Schedule (${dateRange})\n`;
    text += `Timezone: ${formatTimezoneDisplay(timezone)} (${timezone})\n`;
    text += `Matches: ${selectedCount}\n\n`;

    for (const catGroup of groups) {
      text += `— ${catGroup.category} —\n\n`;

      for (const leagueGroup of catGroup.leagues) {
        text += `${leagueGroup.league}\n\n`;

        for (const dateGroup of leagueGroup.dates) {
          text += `${formatDisplayDate(dateGroup.date).toUpperCase()}\n`;

          for (const ev of dateGroup.items) {
            let line = `${ev.time}  ${getMatchLabel(ev)}`;
            const extra = [ev.round, getNotesLabel(ev)].filter(Boolean).join(' - ');
            if (extra) {
              line += ` — ${extra}`;
            }
            text += `${line}\n`;
          }
          text += `\n`;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50 shrink-0 pr-12">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-base">Print Schedule</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {selectedCount} matches · {dateRange || 'No dates'}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {embedInstances.length > 1 && (
                <Select value={selectedEmbed} onValueChange={setSelectedEmbed}>
                  <SelectTrigger className="h-8 w-35 text-xs">
                    <SelectValue placeholder="Schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Schedules</SelectItem>
                    {embedInstances.map(inst => (
                      <SelectItem key={inst.display_id} value={inst.display_id}>
                        {inst.display_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCopyText}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => handlePrint()}>
                <Printer className="w-3.5 h-3.5" />
                Print / PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable preview */}
        <div className="flex-1 overflow-y-auto p-5 bg-white dark:bg-white">
          <div ref={contentRef} style={S.page}>
            <div style={S.title}>Schedule</div>
            <div style={S.subtitle}>{dateRange}</div>
            <div style={S.meta}>
              <span style={S.metaLabel}>Timezone</span>
              <span>{formatTimezoneDisplay(timezone)} ({timezone})</span>
              <span style={S.metaLabel}>Matches</span>
              <span>{selectedCount}</span>
            </div>

            {groups.length === 0 && (
              <p style={{ color: '#888', textAlign: 'center', padding: '40px 0' }}>
                No matches selected
              </p>
            )}

            {groups.map((catGroup) => (
              <div key={catGroup.category} style={S.categoryContainer}>
                {/* Only render category header if it exists and isn't a top-level un-categorized default */}
                {catGroup.category && catGroup.category.trim() !== '' && catGroup.category !== 'Soccer' && (
                  <div style={S.categoryHeader}>– {catGroup.category} –</div>
                )}
                
                {catGroup.leagues.map((leagueGroup) => (
                  <section key={leagueGroup.league} style={S.league} aria-labelledby={getPrintSectionId(leagueGroup.league)}>
                    <div style={S.leagueHeader}>
                      {leagueGroup.logo && (
                        <img
                          src={leagueGroup.logo}
                          alt=""
                          aria-hidden="true"
                          style={S.leagueLogo}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <span id={getPrintSectionId(leagueGroup.league)} style={S.leagueName}>{leagueGroup.league}</span>
                    </div>

                    {leagueGroup.dates.map((dateGroup) => (
                      <div key={dateGroup.date}>
                        <div style={S.dateHeader}>{formatDisplayDate(dateGroup.date)}</div>
                        
                        <div>
                          {dateGroup.items.map((ev) => (
                            <div key={ev.id} style={S.matchRow} data-event-id={ev.id}>
                              <div style={S.time}>{ev.time}</div>
                              <div style={S.matchInfo}>
                                <span style={S.home}>{ev.home}</span>
                                {ev.away && (
                                  <>
                                    <span style={S.vs}>vs</span>
                                    <span style={S.away}>{ev.away}</span>
                                  </>
                                )}
                                {(ev.round || getNotesLabel(ev)) && (
                                  <span style={S.notes}>
                                    – {[ev.round, getNotesLabel(ev)].filter(Boolean).join(' - ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
