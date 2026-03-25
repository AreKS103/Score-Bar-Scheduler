'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarDays, CalendarRange, Calendar1 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';

type CalendarMode = 'range' | 'single';

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

interface DateRangeCalendarProps {
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  onChange: (start: string, end: string) => void;
  onDone?: () => void;
}

export default function DateRangeCalendar({
  startDate,
  endDate,
  onChange,
  onDone,
}: DateRangeCalendarProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CalendarMode>('range');
  const [rangeDraft, setRangeDraft] = useState<DateRange>({ from: undefined, to: undefined });
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const from = parse(startDate, 'yyyy-MM-dd', new Date());
  const to = parse(endDate, 'yyyy-MM-dd', new Date());

  const rangeSelectedFromProps: DateRange = useMemo(
    () => ({
      from: isValid(from) ? from : undefined,
      to: isValid(to) ? to : undefined,
    }),
    [from, to]
  );

  const singleSelected = isValid(from) ? from : undefined;

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range) return;
    setRangeDraft(range);
    if (range.from && range.to) {
      const startDay = range.from < range.to ? range.from : range.to;
      const endDay = range.from < range.to ? range.to : range.from;
      onChange(format(startDay, 'yyyy-MM-dd'), format(endDay, 'yyyy-MM-dd'));
    }
  };

  const handleSingleSelect = (day: Date | undefined) => {
    if (!day) return;
    const formatted = format(day, 'yyyy-MM-dd');
    onChange(formatted, formatted);
  };

  const isSameRange = (a: DateRange, b: DateRange) => {
    const aFrom = a.from?.getTime() ?? null;
    const aTo = a.to?.getTime() ?? null;
    const bFrom = b.from?.getTime() ?? null;
    const bTo = b.to?.getTime() ?? null;
    return aFrom === bFrom && aTo === bTo;
  };

  // Keep draft range synced with external state while closed.
  useEffect(() => {
    if (open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRangeDraft((prev) => (isSameRange(prev, rangeSelectedFromProps) ? prev : rangeSelectedFromProps));
  }, [open, rangeSelectedFromProps]);

  // Every time the picker opens in range mode, sync draft with props.
  useEffect(() => {
    if (!open || mode !== 'range') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRangeDraft((prev) => (isSameRange(prev, rangeSelectedFromProps) ? prev : rangeSelectedFromProps));
  }, [open, mode, rangeSelectedFromProps]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const isSameDay = startDate === endDate;
  const displayText =
    isValid(from) && isValid(to)
      ? isSameDay
        ? format(from, 'EEE, MMM d, yyyy')
        : `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')}`
      : 'Select dates';

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(!open)}
        className={cn(
          'h-9 gap-2 text-sm font-medium',
          open && 'border-ring ring-2 ring-ring/30'
        )}
      >
        <CalendarDays className="w-4 h-4 text-primary" />
        <span>{displayText}</span>
      </Button>

      {open && (
        <div className={cn(
          "absolute top-full mt-2 z-50 rounded-xl border border-border bg-popover p-3 shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95",
          isMobile ? "left-0 right-0 fixed mx-3" : "left-0"
        )}>
          {/* Mode toggle */}
          <div className="flex items-center gap-1 mb-2 px-1">
            <button
              onClick={() => setMode('range')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                mode === 'range'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              Range
            </button>
            <button
              onClick={() => {
                setMode('single');
                // When switching to single, collapse range to start date
                if (startDate !== endDate) {
                  onChange(startDate, startDate);
                }
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                mode === 'single'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Calendar1 className="w-3.5 h-3.5" />
              Single Day
            </button>
          </div>

          {mode === 'range' ? (
            <Calendar
              mode="range"
              selected={rangeDraft}
              onSelect={handleRangeSelect}
              numberOfMonths={isMobile ? 1 : 2}
              showOutsideDays={false}
              today={new Date()}
              modifiersStyles={{
                today: {
                  boxShadow: 'inset 0 0 0 1.5px oklch(0.623 0.214 259)',
                  borderRadius: '0.375rem',
                },
              }}
            />
          ) : (
            <Calendar
              mode="single"
              selected={singleSelected}
              onSelect={handleSingleSelect}
              showOutsideDays={false}
              today={new Date()}
              modifiersStyles={{
                today: {
                  boxShadow: 'inset 0 0 0 1.5px oklch(0.623 0.214 259)',
                  borderRadius: '0.375rem',
                },
              }}
            />
          )}

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border px-1">
            <div className="text-xs text-muted-foreground font-medium">
              {mode === 'single' ? (
                singleSelected ? format(singleSelected, 'EEE, MMM d, yyyy') : 'Pick a date'
              ) : (
                <>
                  {rangeDraft.from && rangeDraft.to ? (
                    <>
                      {format(rangeDraft.from, 'EEE, MMM d')} → {format(rangeDraft.to, 'EEE, MMM d')}
                    </>
                  ) : rangeDraft.from ? (
                    <>{format(rangeDraft.from, 'EEE, MMM d')} → pick end date</>
                  ) : (
                    'Click a start date'
                  )}
                </>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (mode === 'range' && rangeDraft.from && !rangeDraft.to) {
                  const single = format(rangeDraft.from, 'yyyy-MM-dd');
                  onChange(single, single);
                }
                setOpen(false);
                onDone?.();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
