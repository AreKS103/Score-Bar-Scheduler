'use client';

import { useRef, useMemo, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, Download } from 'lucide-react';
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
import { CATEGORY_ORDER, SPORTS_CONFIG } from '@/lib/config';
import { formatDisplayDate } from '@/lib/timezone';
import type { MatchEvent } from '@/types';

/* ── helpers ─────────────────────────────────────────────────────────── */

function categorySort(cat: string): number {
  const idx = CATEGORY_ORDER.indexOf(cat);
  return idx === -1 ? 999 : idx;
}

/** Group selected events by league label, sorted by category then league */
function groupForPrint(events: MatchEvent[]): { league: string; logo: string; items: MatchEvent[] }[] {
  const map = new Map<string, { logo: string; category: string; items: MatchEvent[] }>();
  for (const e of events) {
    if (!e.isSelected) continue;
    const key = e.leagueLabel;
    if (!map.has(key)) map.set(key, { logo: e.leagueLogo, category: e.category, items: [] });
    map.get(key)!.items.push(e);
  }

  return [...map.entries()]
    .sort(([, a], [, b]) => categorySort(a.category) - categorySort(b.category))
    .map(([league, { logo, items }]) => ({
      league,
      logo,
      items: items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
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

/* ── inline styles for print (no Tailwind in print iframe) ───────── */

const S = {
  page: { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', color: '#111', padding: '0', fontSize: '11px', lineHeight: '1.5' } as const,
  title: { fontSize: '16px', fontWeight: 700, marginBottom: '4px' } as const,
  subtitle: { fontSize: '11px', color: '#666', marginBottom: '16px' } as const,
  league: { marginBottom: '14px', breakInside: 'avoid' as const } as const,
  leagueHeader: { display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '4px', borderBottom: '1px solid #ddd', marginBottom: '6px' } as const,
  leagueLogo: { height: '16px', width: '16px', objectFit: 'contain' as const, flexShrink: 0 } as const,
  leagueName: { fontSize: '12px', fontWeight: 700 } as const,
  dateRow: { fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#888', padding: '3px 0', marginTop: '4px' } as const,
  row: { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', borderBottom: '1px solid #f0f0f0' } as const,
  time: { fontWeight: 700, fontSize: '11px', width: '38px', flexShrink: 0, fontVariantNumeric: 'tabular-nums' as const } as const,
  teams: { flex: 1, fontSize: '11px' } as const,
  round: { fontSize: '9px', color: '#999', fontStyle: 'italic' as const } as const,
  teamLogo: { height: '14px', width: '14px', objectFit: 'contain' as const, verticalAlign: 'middle', marginRight: '3px' } as const,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50 shrink-0">
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

            {groups.length === 0 && (
              <p style={{ color: '#999', textAlign: 'center', padding: '40px 0' }}>
                No matches selected
              </p>
            )}

            {groups.map(({ league, logo, items }) => {
              // Group items by date
              const byDate = new Map<string, MatchEvent[]>();
              for (const item of items) {
                if (!byDate.has(item.date)) byDate.set(item.date, []);
                byDate.get(item.date)!.push(item);
              }

              return (
                <div key={league} style={S.league}>
                  <div style={S.leagueHeader}>
                    {logo && (
                      <img
                        src={logo}
                        alt=""
                        style={S.leagueLogo}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <span style={S.leagueName}>{league}</span>
                  </div>

                  {[...byDate.entries()].map(([date, dateEvents]) => (
                    <div key={date}>
                      <div style={S.dateRow}>{formatDisplayDate(date)}</div>
                      {dateEvents.map(ev => (
                        <div key={ev.id} style={S.row}>
                          <span style={S.time}>{ev.time}</span>
                          <span style={S.teams}>
                            {ev.homeLogo && (
                              <img
                                src={ev.homeLogo}
                                alt=""
                                style={S.teamLogo}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            {ev.home}
                            {ev.away && (
                              <>
                                {' vs '}
                                {ev.awayLogo && (
                                  <img
                                    src={ev.awayLogo}
                                    alt=""
                                    style={S.teamLogo}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                )}
                                {ev.away}
                              </>
                            )}
                          </span>
                          {ev.round && <span style={S.round}>{ev.round}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
