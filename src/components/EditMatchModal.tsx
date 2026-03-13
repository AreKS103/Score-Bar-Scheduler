'use client';

import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
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

interface EditMatchModalProps {
  event: MatchEvent | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<MatchEvent>) => void;
}

export default function EditMatchModal({ event, onClose, onSave }: EditMatchModalProps) {
  const [sportId, setSportId] = useState(SPORTS_CONFIG[0]?.id ?? '');
  const [customLeague, setCustomLeague] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [round, setRound] = useState('');
  const [tags, setTags] = useState<ScreenTag[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);

  // Populate fields when event changes
  useEffect(() => {
    if (!event) return;
    const knownSport = SPORTS_CONFIG.find((s) => s.id === event.sportId);
    if (knownSport) {
      setSportId(knownSport.id);
      setCustomLeague('');
    } else {
      setSportId(SPORTS_CONFIG[0].id);
      setCustomLeague(event.leagueLabel);
    }
    setDate(event.date);
    setTime(event.time);
    setHome(event.home);
    setAway(event.away);
    setRound(event.round);
    setTags([...event.tags]);
    setIsFeatured(event.isFeatured);
  }, [event]);

  const toggleTag = (tag: ScreenTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !date || !time || !home) return;

    const useCustom = customLeague.trim().length > 0;
    const selectedSport = SPORTS_CONFIG.find((s) => s.id === sportId);
    const leagueLabel = useCustom ? customLeague.trim() : selectedSport?.label || event.leagueLabel;
    const leagueId = useCustom ? `custom-${customLeague.trim().toLowerCase().replace(/\s+/g, '-')}` : sportId;

    onSave(event.id, {
      sportId: leagueId,
      category: useCustom ? 'Custom' : selectedSport?.category || event.category,
      leagueLabel,
      leagueLogo: useCustom ? '' : selectedSport?.logo || event.leagueLogo,
      date,
      time,
      home,
      away,
      round,
      tags,
      isFeatured,
    });
    onClose();
  };

  const isOpen = !!event;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Edit Match
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
              <Label>Date (Phnom Penh Time)</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
                    'text-xs px-2.5 py-1 rounded-full border transition-all',
                    tags.includes(tag)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-featured"
              checked={isFeatured}
              onCheckedChange={(checked) => setIsFeatured(!!checked)}
            />
            <Label htmlFor="edit-featured" className="cursor-pointer">
              ⭐ Featured (appears in highlights)
            </Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!event}>
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
