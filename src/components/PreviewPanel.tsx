'use client';
import { memo, useRef, useEffect, useMemo } from 'react';
import { Copy, CheckCircle } from 'lucide-react';
import type DOMPurifyType from 'dompurify';
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
  previewSelectedIds?: Set<string>;
  onPreviewMatchClick?: (eventId: string, multi: boolean) => void;
  onPreviewClearSelection?: () => void;
}

function PreviewPanel({
  html,
  matchCount,
  leagueCount,
  lastPushed,
  onCopy,
  copied,
  onPreviewContextMenu,
  scrollToMatchId,
  previewSelectedIds,
  onPreviewMatchClick,
  onPreviewClearSelection,
}: PreviewPanelProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  // DOMPurify requires a real DOM — initialize lazily on the client only.
  const purify = useMemo<typeof DOMPurifyType | null>(() => {
    if (typeof window === 'undefined') return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('dompurify');
    return (mod.default ?? mod) as typeof DOMPurifyType;
  }, []);

  // Sanitizing the full preview HTML is expensive — only redo it when the
  // HTML actually changes, not on every unrelated re-render.
  const sanitizedHtml = useMemo(
    () => (purify ? purify.sanitize(html, { USE_PROFILES: { html: true } }) : html),
    [purify, html],
  );

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

  // Apply/remove selection highlight on preview-selected match spans
  useEffect(() => {
    if (!previewRef.current) return;
    const nodes = previewRef.current.querySelectorAll('[data-preview-match="1"]');
    nodes.forEach((node) => {
      const el = node as HTMLElement;
      const id = el.getAttribute('data-preview-match-id') || '';
      if (previewSelectedIds?.has(id)) {
        el.style.boxShadow = 'inset 0 0 0 2px rgba(99,102,241,0.65)';
        el.style.borderRadius = '3px';
        el.style.backgroundColor = 'rgba(99,102,241,0.08)';
      } else {
        el.style.boxShadow = '';
        el.style.borderRadius = '';
        el.style.backgroundColor = '';
      }
    });
  }, [previewSelectedIds, html]);

  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    // Only respond to left-click (button 0)
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const matchNode = target.closest('[data-preview-match="1"]') as HTMLElement | null;
    if (matchNode) {
      const eventId = matchNode.getAttribute('data-preview-match-id') || '';
      if (eventId && onPreviewMatchClick) {
        // Ctrl (Win/Linux) or Cmd (Mac) = add to / toggle from existing selection
        const multi = event.ctrlKey || event.metaKey;
        onPreviewMatchClick(eventId, multi);
      }
    } else {
      onPreviewClearSelection?.();
    }
  };

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
        className="bg-white border border-border rounded-lg p-6 overflow-y-auto max-w-none
          [&_.sb-schedule]:text-zinc-900
          [&_[data-preview-match]]:cursor-pointer
          [&_[data-preview-match].sb-preview-selected]:outline
          [&_[data-preview-match].sb-preview-selected]:outline-2
          [&_[data-preview-match].sb-preview-selected]:outline-amber-400/60
        "
        onContextMenu={handlePreviewContextMenu}
        onClick={handlePreviewClick}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
}

// Memoized: parent re-renders frequently (drag, typing, selection state) and
// re-rendering this panel re-applies a large dangerouslySetInnerHTML subtree.
export default memo(PreviewPanel);
