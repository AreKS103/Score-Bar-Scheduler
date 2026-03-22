'use client';
import { useRef, useEffect } from 'react';
import { Copy, CheckCircle } from 'lucide-react';
import type { MouseEvent } from 'react';
import { cn } from '@/lib/utils';

interface PreviewPanelProps {
  html: string;
  matchCount: number;
  leagueCount: number;
  lastPushed?: string | null;
  onCopy?: () => void;
  copied?: boolean;
  onPreviewContextMenu?: (payload:
    | {
        type: 'league';
        sportId: string;
        leagueLabel: string;
        x: number;
        y: number;
      }
    | {
        type: 'match';
        eventId: string;
        sportId: string;
        leagueLabel: string;
        x: number;
        y: number;
      }
  ) => void;
  scrollToMatchId?: string | null;
}

export default function PreviewPanel({
  html,
  matchCount,
  leagueCount,
  lastPushed,
  onCopy,
  copied,
  onPreviewContextMenu,
  scrollToMatchId,
}: PreviewPanelProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollToMatchId || !previewRef.current) return;
    
    // We delay slightly to ensure dangerouslySetInnerHTML has painted the new nodes
    const timer = setTimeout(() => {
      const el = previewRef.current?.querySelector(`[data-preview-match-id="${scrollToMatchId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add a temporary highlight effect by directly modifying the DOM element
        const htmlElement = el as HTMLElement;
        const originalBg = htmlElement.style.backgroundColor;
        htmlElement.style.transition = 'background-color 0.5s ease-out';
        htmlElement.style.backgroundColor = 'rgba(234, 179, 8, 0.3)'; // Highlight color (amber-500 with opacity)
        
        setTimeout(() => {
          htmlElement.style.backgroundColor = originalBg;
          // Clear transition after fading out
          setTimeout(() => {
            htmlElement.style.transition = '';
          }, 500);
        }, 1500);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [scrollToMatchId, html]);

  const handlePreviewContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    // In preview, always suppress the browser context menu.
    event.preventDefault();

    if (!onPreviewContextMenu) return;

    const target = event.target as HTMLElement;
    const root = event.currentTarget;

    const matchNode = target.closest('[data-preview-match="1"]') as HTMLElement | null;
    if (matchNode) {
      const eventId = matchNode.getAttribute('data-preview-match-id') || '';
      const sportId = matchNode.getAttribute('data-preview-sport-id') || '';
      if (eventId && sportId) {
        onPreviewContextMenu({
          type: 'match',
          eventId,
          sportId,
          leagueLabel: matchNode.getAttribute('data-preview-league-label') || sportId,
          x: event.clientX,
          y: event.clientY,
        });
      }
      return;
    }

    let leagueNode = target.closest('[data-preview-league="1"]') as HTMLElement | null;

    // If user right-clicked a match line under the header, resolve to the
    // nearest preceding league header/logo block.
    if (!leagueNode) {
      const tagged = Array.from(
        root.querySelectorAll('[data-preview-league="1"]')
      ) as HTMLElement[];
      for (const node of tagged) {
        const relation = node.compareDocumentPosition(target);
        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
          leagueNode = node;
        }
      }
    }

    if (!leagueNode) return;

    const sportId = leagueNode.getAttribute('data-preview-sport-id') || '';
    if (!sportId) return;

    onPreviewContextMenu({
      type: 'league',
      sportId,
      leagueLabel: leagueNode.getAttribute('data-preview-league-label') || leagueNode.textContent?.trim() || sportId,
      x: event.clientX,
      y: event.clientY,
    });
  };

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex items-center justify-between bg-secondary/50 border border-border rounded-lg px-4 py-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{matchCount}</strong> matches selected
            </span>
            <span className="text-border">|</span>
            <span>
              across <strong className="text-foreground">{leagueCount}</strong> leagues
            </span>
          </div>
          <div className="flex items-center gap-3">
            {lastPushed && (
              <span className="text-xs text-muted-foreground">Last pushed: {lastPushed}</span>
            )}
            {onCopy && (
              <button
                onClick={onCopy}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-all font-medium',
                  copied
                    ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
                    : 'text-muted-foreground border-border hover:text-foreground hover:bg-secondary'
                )}
              >
                {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy HTML'}
              </button>
            )}
          </div>
      </div>

      {/* HTML preview — adapts to current theme */}
      <div
        ref={previewRef}
        className="bg-card border border-border rounded-lg p-8 overflow-y-auto prose prose-sm max-w-none
          dark:prose-invert
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2
          [&_h2]:text-zinc-800 dark:[&_h2]:text-white
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
          [&_h3]:text-zinc-700 dark:[&_h3]:text-zinc-200
          [&_hr]:border-border [&_hr]:my-6
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5
          [&_li]:leading-relaxed [&_li]:text-zinc-600 dark:[&_li]:text-zinc-300
          [&_p]:leading-relaxed [&_p]:my-3 [&_p]:text-zinc-600 dark:[&_p]:text-zinc-300
          [&_strong]:text-zinc-900 dark:[&_strong]:text-white
          [&_em]:not-italic [&_em]:text-xs [&_em]:px-1.5 [&_em]:py-0.5 [&_em]:rounded
          [&_em]:bg-primary/10 [&_em]:text-primary
          [&_img]:inline [&_img]:h-8 [&_img]:w-auto [&_img]:my-0
          [&_br]:leading-8
        "
        onContextMenu={handlePreviewContextMenu}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
