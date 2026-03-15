'use client';

import { useEffect, useRef, useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import { CalendarDays, Clock3, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MatchEvent, ScreenTag } from '@/types';
import { SPORTS_CONFIG, ALL_SCREEN_TAGS } from '@/lib/config';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AddMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (event: MatchEvent) => Promise<void> | void;
}

export default function AddMatchModal({ isOpen, onClose, onAdd }: AddMatchModalProps) {
  const [sportId, setSportId] = useState('');
  const [customLeague, setCustomLeague] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [round, setRound] = useState('');
  const [tags, setTags] = useState<ScreenTag[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);
  const [customLeagueLogo, setCustomLeagueLogo] = useState('');
  const [customLogoPath, setCustomLogoPath] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ sport: boolean; date: boolean; time: boolean; home: boolean }>({
    sport: false,
    date: false,
    time: false,
    home: false,
  });
  const logoInputRef = useRef<HTMLInputElement>(null);

  const selectedSport = SPORTS_CONFIG.find((s) => s.id === sportId);
  const selectedDate = parse(date, 'dd/MM/yyyy', new Date());

  const minuteOptions = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

  const parseDisplayDate = (value: string): string | null => {
    const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    if (d.getUTCFullYear() !== Number(yyyy) || d.getUTCMonth() + 1 !== Number(mm) || d.getUTCDate() !== Number(dd)) return null;
    return `${yyyy}-${mm}-${dd}`;
  };

  const normalizeTimeInput = (value: string): string | null => {
    const m = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const formatTimeFromDigits = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(-4);
    if (!digits) return '';
    if (digits.length <= 2) return digits;
    if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  };

  const toCustomCategory = (league: string): string =>
    league
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

  const handleCustomLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploadError('');
    const form = new FormData();
    form.append('file', file);
    form.append('leagueLabel', customLeague.trim() || 'custom-league');

    const res = await fetch('/api/custom-events/logo', {
      method: 'POST',
      body: form,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = [
        data?.error,
        data?.details,
      ]
        .filter(Boolean)
        .join(' | ') || `Upload failed (${res.status})`;
      setUploadError(String(message));
      console.error('[AddMatchModal] logo upload failed', { status: res.status, error: data?.error ?? null });
      return;
    }

    if (!data?.publicUrl || !data?.path) return;

    setCustomLeagueLogo(String(data.publicUrl));
    setCustomLogoPath(String(data.path));
    setUploadError('');
  };

  // Always start add-flow fresh so previous custom logos never carry over.
  useEffect(() => {
    if (!isOpen) return;
    setCustomLeagueLogo('');
    setCustomLogoPath('');
    setUploadError('');
  }, [isOpen]);

  const toggleTag = (tag: ScreenTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const setHour = (hour: string) => {
    const minute = time ? time.split(':')[1] : '00';
    setTime(`${hour}:${minute}`);
  };

  const setMinute = (minute: string) => {
    const hour = time ? time.split(':')[0] : '00';
    setTime(`${hour}:${minute}`);
  };

  const selectedHour = time ? time.split(':')[0] : '';
  const selectedMinute = time ? time.split(':')[1] : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const isoDate = parseDisplayDate(date);
    const normalizedTime = normalizeTimeInput(time);

    const useCustom = customLeague.trim().length > 0;
    const hasSportChoice = useCustom || !!sportId;
    const nextErrors = {
      sport: !hasSportChoice,
      date: !isoDate,
      time: !normalizedTime,
      home: !home.trim(),
    };
    setFieldErrors(nextErrors);
    if (nextErrors.sport || nextErrors.date || nextErrors.time || nextErrors.home) return;

    // Re-guard with direct checks so TypeScript narrows nullable values.
    if (!isoDate || !normalizedTime) return;

    const leagueLabel = useCustom ? customLeague.trim() : (selectedSport?.label ?? '');
    const leagueId = useCustom ? `custom-${customLeague.trim().toLowerCase().replace(/\s+/g, '-')}` : sportId;
    const category = useCustom ? toCustomCategory(customLeague) : (selectedSport?.category ?? '');
    const leagueLogo = useCustom ? customLeagueLogo : (selectedSport?.logo ?? '');

    const newEvent: MatchEvent = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'manual',
      sportId: leagueId,
      category,
      leagueLabel,
      leagueLogo,
      customLogoPath: useCustom && customLogoPath ? customLogoPath : undefined,
      date: isoDate,
      time: normalizedTime,
      home,
      away,
      round,
      tags,
      isFeatured,
      isSelected: true,
    };

    setIsSubmitting(true);
    try {
      await onAdd(newEvent);
      setHome('');
      setAway('');
      setRound('');
      setTags([]);
      setIsFeatured(false);
      setCustomLeague('');
      setSportId('');
      setCustomLeagueLogo('');
      setCustomLogoPath('');
      setUploadError('');
      setFieldErrors({ sport: false, date: false, time: false, home: false });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Add Custom Match
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-[3]">
              <Label className={fieldErrors.sport ? 'text-destructive' : ''}>Sport / League</Label>
              <Select value={sportId} onValueChange={(v) => { setSportId(v); setCustomLeague(''); setFieldErrors((p) => ({ ...p, sport: false })); }}>
                <SelectTrigger className={cn('mt-1.5 w-full', fieldErrors.sport && 'border-destructive focus-visible:ring-destructive')}>
                  <SelectValue placeholder="Select sport / league" />
                </SelectTrigger>
                <SelectContent>
                  {SPORTS_CONFIG.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.category} — {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.sport && <p className="mt-1 text-xs text-destructive">Select a sport/league or enter a custom league.</p>}
            </div>
            <div className="flex-[2]">
              <Label>Custom League <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="text"
                value={customLeague}
                onChange={(e) => { setCustomLeague(e.target.value); setFieldErrors((p) => ({ ...p, sport: false })); }}
                placeholder="e.g. Ligue 2"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={fieldErrors.date ? 'text-destructive' : ''}>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      'mt-1.5 h-10 w-full justify-start gap-2 text-sm font-medium',
                      !date && 'text-muted-foreground',
                      fieldErrors.date && 'border-destructive focus-visible:ring-destructive'
                    )}
                  >
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <span>{date || 'dd/mm/yyyy'}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto rounded-xl border border-border bg-popover p-3 shadow-2xl shadow-black/30">
                  <Calendar
                    mode="single"
                    selected={isValid(selectedDate) ? selectedDate : undefined}
                    onSelect={(day) => {
                      if (!day) return;
                      setDate(format(day, 'dd/MM/yyyy'));
                      setFieldErrors((p) => ({ ...p, date: false }));
                    }}
                    fixedWeeks
                    today={new Date()}
                    modifiersStyles={{
                      today: {
                        boxShadow: 'inset 0 0 0 1.5px oklch(0.623 0.214 259)',
                        borderRadius: '0.375rem',
                      },
                    }}
                  />
                </PopoverContent>
              </Popover>
              {fieldErrors.date && <p className="mt-1 text-xs text-destructive">Date is required.</p>}
            </div>
            <div>
              <Label className={fieldErrors.time ? 'text-destructive' : ''}>Time (24hr)</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  type="text"
                  value={time}
                  onChange={(e) => { setTime(formatTimeFromDigits(e.target.value)); setFieldErrors((p) => ({ ...p, time: false })); }}
                  placeholder="HH:MM"
                  inputMode="numeric"
                  autoComplete="off"
                  className={cn('h-10 flex-1 font-mono', fieldErrors.time && 'border-destructive focus-visible:ring-destructive')}
                />
                <Popover open={timePickerOpen} onOpenChange={setTimePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="h-10 w-10 px-0" aria-label="Open time picker">
                      <Clock3 className="h-4 w-4 text-white" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 rounded-xl border border-border bg-popover p-3 shadow-2xl shadow-black/30">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Select time</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="mb-1 block text-xs text-muted-foreground">Hour</Label>
                      <Select value={selectedHour} onValueChange={setHour}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="HH" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {hourOptions.map((hour) => (
                            <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-muted-foreground">Minute</Label>
                      <Select value={selectedMinute} onValueChange={setMinute}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="MM" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {minuteOptions.map((minute) => (
                            <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  </PopoverContent>
                </Popover>
              </div>
              {fieldErrors.time && <p className="mt-1 text-xs text-destructive">Valid time is required (HH:MM).</p>}
            </div>
          </div>

          <div>
            <Label>League Image <span className="text-muted-foreground">(optional)</span></Label>
            <div className="mt-1.5 flex items-center gap-3">
              {customLeagueLogo ? (
                <>
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="group relative h-12 w-12 overflow-hidden rounded border border-border bg-background"
                    aria-label="Change logo"
                  >
                    <img
                      src={customLeagueLogo}
                      alt="Custom league logo"
                      className="h-full w-full object-contain transition-opacity group-hover:opacity-35"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Pencil className="h-4 w-4 text-white" />
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-10 px-0 text-destructive hover:text-destructive"
                    aria-label="Remove logo"
                    onClick={() => {
                      setCustomLeagueLogo('');
                      setCustomLogoPath('');
                      setUploadError('');
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <label
                  htmlFor="add-custom-logo-input"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <ImagePlus className="h-4 w-4" />
                  Upload Logo
                </label>
              )}
              <input
                id="add-custom-logo-input"
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleCustomLogoUpload(file);
                  e.currentTarget.value = '';
                }}
              />
              {!customLeagueLogo && (
                <span className="text-xs text-muted-foreground">No logo selected</span>
              )}
            </div>
            {uploadError && <p className="mt-1 text-xs text-destructive">{uploadError}</p>}
          </div>

          <div>
            <Label className={fieldErrors.home ? 'text-destructive' : ''}>Home Team / Event Name</Label>
            <Input
              type="text"
              value={home}
              onChange={(e) => { setHome(e.target.value); setFieldErrors((p) => ({ ...p, home: false })); }}
              required
              placeholder="e.g. Manchester United"
              className={cn('mt-1.5', fieldErrors.home && 'border-destructive focus-visible:ring-destructive')}
            />
            {fieldErrors.home && <p className="mt-1 text-xs text-destructive">Home team / event name is required.</p>}
          </div>

          <div>
            <Label>Away Team <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              type="text"
              value={away}
              onChange={(e) => setAway(e.target.value)}
              placeholder="e.g. Liverpool"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>Round / Subtitle <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              type="text"
              value={round}
              onChange={(e) => setRound(e.target.value)}
              placeholder="e.g. Quarter Final (Leg 1)"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="mb-2 block">Screen Tags</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_SCREEN_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full border transition-all',
                    tags.includes(tag)
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-transparent border-border text-muted-foreground hover:border-muted-foreground/50'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="featured"
              checked={isFeatured}
              onCheckedChange={(checked) => setIsFeatured(!!checked)}
            />
            <Label htmlFor="featured" className="cursor-pointer">
              ⭐ Feature in highlights
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add Match'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
