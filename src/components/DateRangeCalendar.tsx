'use client';

import { useState, useRef, useEffect } from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarDays, CalendarRange, Calendar1 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';

type CalendarMode = 'range' | 'single';

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
  const ref = useRef<HTMLDivElement>(null);

  const from = parse(startDate, 'yyyy-MM-dd', new Date());
  const to = parse(endDate, 'yyyy-MM-dd', new Date());

  const rangeSelected: DateRange = {
    from: isValid(from) ? from : undefined,
    to: isValid(to) ? to : undefined,
  };

  const singleSelected = isValid(from) ? from : undefined;

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range) return;
    const newFrom = range.from ? format(range.from, 'yyyy-MM-dd') : startDate;
    const newTo = range.to ? format(range.to, 'yyyy-MM-dd') : newFrom;
    onChange(newFrom, newTo);
  };

  const handleSingleSelect = (day: Date | undefined) => {
    if (!day) return;
    const formatted = format(day, 'yyyy-MM-dd');
    onChange(formatted, formatted);
  };

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
        <div className="absolute top-full left-0 mt-2 z-50 rounded-xl border border-border bg-popover p-3 shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95">
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
              selected={rangeSelected}
              onSelect={handleRangeSelect}
              numberOfMonths={2}
              fixedWeeks
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
              fixedWeeks
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
                  {rangeSelected.from && rangeSelected.to ? (
                    <>
                      {format(rangeSelected.from, 'EEE, MMM d')} → {format(rangeSelected.to, 'EEE, MMM d')}
                    </>
                  ) : rangeSelected.from ? (
                    <>{format(rangeSelected.from, 'EEE, MMM d')} → pick end date</>
                  ) : (
                    'Click a start date, then an end date'
                  )}
                </>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setOpen(false); onDone?.(); }}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
