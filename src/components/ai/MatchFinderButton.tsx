'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMatchFinder } from './MatchFinderProvider';

export default function MatchFinderButton() {
  const { toggle, isOpen } = useMatchFinder();

  return (
    <Button
      variant={isOpen ? 'default' : 'outline'}
      size="sm"
      className="sm:text-xs sm:h-7 sm:px-2 gap-1"
      onClick={toggle}
      title="AI Match Finder"
    >
      <Sparkles className="w-3.5 h-3.5" />
      <span className="phone-ls-hide">AI Finder</span>
    </Button>
  );
}
