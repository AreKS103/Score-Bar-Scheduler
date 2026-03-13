'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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

interface AddMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (event: MatchEvent) => void;
}

export default function AddMatchModal({ isOpen, onClose, onAdd }: AddMatchModalProps) {
  const [sportId, setSportId] = useState(SPORTS_CONFIG[0].id);
  const [customLeague, setCustomLeague] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [round, setRound] = useState('');
  const [tags, setTags] = useState<ScreenTag[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);

  const selectedSport = SPORTS_CONFIG.find((s) => s.id === sportId)!;

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

  const toggleTag = (tag: ScreenTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isoDate = parseDisplayDate(date);
    if (!isoDate || !time || !home) return;

    const useCustom = customLeague.trim().length > 0;
    const leagueLabel = useCustom ? customLeague.trim() : selectedSport.label;
    const leagueId = useCustom ? `custom-${customLeague.trim().toLowerCase().replace(/\s+/g, '-')}` : sportId;

    const newEvent: MatchEvent = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'manual',
      sportId: leagueId,
      category: useCustom ? 'Custom' : selectedSport.category,
      leagueLabel,
      leagueLogo: useCustom ? '' : selectedSport.logo,
      date: isoDate,
      time,
      home,
      away,
      round,
      tags,
      isFeatured,
      isSelected: true,
    };

    onAdd(newEvent);
    setHome('');
    setAway('');
    setRound('');
    setTags([]);
    setIsFeatured(false);
    setCustomLeague('');
    onClose();
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
              <Label>Sport / League</Label>
              <Select value={sportId} onValueChange={(v) => { setSportId(v); setCustomLeague(''); }}>
                <SelectTrigger className="mt-1.5 w-full">
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
            </div>
            <div className="flex-[2]">
              <Label>Custom League <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="text"
                value={customLeague}
                onChange={(e) => setCustomLeague(e.target.value)}
                placeholder="e.g. Ligue 2"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
                <Label>Date — dd/mm/yyyy</Label>
              <Input
                  type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                  placeholder="14/03/2026"
                  inputMode="numeric"
                  pattern="^\d{1,2}/\d{1,2}/\d{4}$"
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Time (24hr)</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label>Home Team / Event Name</Label>
            <Input
              type="text"
              value={home}
              onChange={(e) => setHome(e.target.value)}
              required
              placeholder="e.g. Manchester United"
              className="mt-1.5"
            />
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

          <Button type="submit" className="w-full">
            Add Match
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
