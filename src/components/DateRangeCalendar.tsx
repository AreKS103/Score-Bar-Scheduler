'use client';

import { useState, useRef, useEffect } from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';

interface DateRangeCalendarProps {
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  onChange: (start: string, end: string) => void;
}

export default function DateRangeCalendar({
  startDate,
  endDate,
  onChange,
}: DateRangeCalendarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const from = parse(startDate, 'yyyy-MM-dd', new Date());
  const to = parse(endDate, 'yyyy-MM-dd', new Date());

  const selected: DateRange = {
    from: isValid(from) ? from : undefined,
    to: isValid(to) ? to : undefined,
  };

  const handleSelect = (range: DateRange | undefined) => {
    if (!range) return;
    const newFrom = range.from ? format(range.from, 'yyyy-MM-dd') : startDate;
    const newTo = range.to ? format(range.to, 'yyyy-MM-dd') : newFrom;
    onChange(newFrom, newTo);
    // Calendar stays open — user must click Done to confirm
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

  const displayText =
    isValid(from) && isValid(to)
      ? `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')}`
      : 'Select date range';

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
          <Calendar
            mode="range"
            selected={selected}
            onSelect={handleSelect}
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
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border px-1">
            <div className="text-xs text-muted-foreground font-medium">
              {selected.from && selected.to ? (
                <>
                  {format(selected.from, 'EEE, MMM d')} → {format(selected.to, 'EEE, MMM d')}
                </>
              ) : selected.from ? (
                <>{format(selected.from, 'EEE, MMM d')} → pick end date</>
              ) : (
                'Click a start date, then an end date'
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
