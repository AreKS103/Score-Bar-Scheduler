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
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [round, setRound] = useState('');
  const [tags, setTags] = useState<ScreenTag[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);

  const selectedSport = SPORTS_CONFIG.find((s) => s.id === sportId)!;

  const toggleTag = (tag: ScreenTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time || !home) return;

    const newEvent: MatchEvent = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'manual',
      sportId,
      category: selectedSport.category,
      leagueLabel: selectedSport.label,
      leagueLogo: selectedSport.logo,
      date,
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
          <div>
            <Label>Sport / League</Label>
            <Select value={sportId} onValueChange={setSportId}>
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
