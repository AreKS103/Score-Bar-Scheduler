'use client';
import { useRef, useEffect, useMemo } from 'react';
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

export default function PreviewPanel({
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
        className="bg-card border border-border rounded-lg p-8 overflow-y-auto prose prose-sm max-w-none
          dark:prose-invert
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2
          [&_h2]:text-zinc-800 dark:[&_h2]:text-white
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
          [&_h3]:text-zinc-700 dark:[&_h3]:text-zinc-200
          [&_hr]:border-border [&_hr]:my-6
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5
          [&_li]:leading-relaxed [&_li]:text-zinc-600 dark:[&_li]:text-zinc-300
          [&_p]:leading-relaxed [&_p]:my-1 [&_p]:text-zinc-600 dark:[&_p]:text-zinc-300
          [&_p_strong]:block [&_p_strong]:text-[0.73em] [&_p_strong]:font-semibold
          [&_p_strong]:uppercase [&_p_strong]:tracking-widest
          [&_p_strong]:!text-zinc-500 dark:[&_p_strong]:!text-zinc-400
          [&_p_strong]:mt-3 [&_p_strong]:mb-1
          [&_em]:not-italic [&_em]:text-xs [&_em]:px-1.5 [&_em]:py-0.5 [&_em]:rounded
          [&_em]:bg-primary/10 [&_em]:text-primary
          [&_img]:inline [&_img]:h-8 [&_img]:w-auto [&_img]:my-0
          [&_.match-group]:my-0 [&_.match-group]:mb-2
          [&_.match-row]:flex [&_.match-row]:items-center [&_.match-row]:gap-1.5 [&_.match-row]:py-0.5
          [&_.ml-time]:text-[0.8em] [&_.ml-time]:font-normal [&_.ml-time]:text-zinc-800 dark:[&_.ml-time]:text-white [&_.ml-time]:shrink-0 [&_.ml-time]:min-w-[38px]
          [&_.ml-match]:flex [&_.ml-match]:items-center [&_.ml-match]:gap-1 [&_.ml-match]:flex-1 [&_.ml-match]:flex-wrap [&_.ml-match]:text-zinc-800 dark:[&_.ml-match]:text-zinc-200
          [&_.mc-team]:inline-flex [&_.mc-team]:items-center [&_.mc-team]:gap-0.5
          [&_.vs-sep]:italic [&_.vs-sep]:text-[0.82em] [&_.vs-sep]:opacity-50 [&_.vs-sep]:mx-1.5
          [&_.mc-round]:text-[0.82em] [&_.mc-round]:opacity-50
          [&_.hl-section]:mb-5
          [&_.hl-title]:!text-base [&_.hl-title]:!font-extrabold [&_.hl-title]:uppercase [&_.hl-title]:tracking-wide [&_.hl-title]:!mb-2.5
          [&_.hl-date-group]:mt-3
          [&_.hl-date-header]:!text-[0.72em] [&_.hl-date-header]:!font-extrabold [&_.hl-date-header]:uppercase [&_.hl-date-header]:tracking-widest [&_.hl-date-header]:pb-1.5 [&_.hl-date-header]:border-b [&_.hl-date-header]:border-border
          [&_.hl-event]:py-2 [&_.hl-event]:border-b [&_.hl-event]:border-border/70 [&_.hl-event:last-child]:border-b-0
          [&_.hl-event-main]:grid [&_.hl-event-main]:grid-cols-[minmax(42px,max-content)_minmax(0,1fr)] [&_.hl-event-main]:items-center [&_.hl-event-main]:gap-x-2.5 [&_.hl-event-main]:gap-y-0.5
          [&_.hl-time]:col-start-1 [&_.hl-time]:row-start-2 [&_.hl-time]:!text-[0.78em] [&_.hl-time]:!font-normal [&_.hl-time]:text-zinc-800 dark:[&_.hl-time]:text-white [&_.hl-time]:leading-none [&_.hl-time]:whitespace-nowrap
          [&_.hl-teams]:col-start-2 [&_.hl-teams]:row-start-2 [&_.hl-teams]:!flex [&_.hl-teams]:items-center [&_.hl-teams]:gap-1.5 [&_.hl-teams]:min-w-0 [&_.hl-teams]:!font-normal [&_.hl-teams]:leading-tight [&_.hl-teams]:text-zinc-800 dark:[&_.hl-teams]:text-zinc-100
          [&_.hl-team]:inline-flex [&_.hl-team]:items-center [&_.hl-team]:gap-1 [&_.hl-team]:!font-normal [&_.hl-team-name]:min-w-0 [&_.hl-team-name]:break-words [&_.hl-team]:min-w-0
          [&_.hl-team-logo]:!h-[22px] [&_.hl-team-logo]:max-w-7 [&_.hl-team-logo]:object-contain [&_.hl-team-logo]:shrink-0
          [&_.hl-vs]:italic [&_.hl-vs]:text-[0.78em] [&_.hl-vs]:opacity-50 [&_.hl-vs]:mx-0.5 [&_.hl-vs]:shrink-0
          [&_.hl-event-detail]:col-start-2 [&_.hl-event-detail]:row-start-1 [&_.hl-event-detail]:!text-[0.72em] [&_.hl-event-detail]:font-semibold [&_.hl-event-detail]:uppercase [&_.hl-event-detail]:tracking-wider [&_.hl-event-detail]:text-muted-foreground
          max-[520px]:[&_.hl-event-main]:grid-cols-[minmax(38px,max-content)_minmax(0,1fr)] max-[520px]:[&_.hl-teams-h2h]:!grid max-[520px]:[&_.hl-teams-h2h]:grid-cols-1 max-[520px]:[&_.hl-vs]:hidden max-[520px]:[&_.hl-team-logo]:!h-[18px]
        "
        onContextMenu={handlePreviewContextMenu}
        onClick={handlePreviewClick}
        dangerouslySetInnerHTML={{ __html: purify ? purify.sanitize(html, { USE_PROFILES: { html: true } }) : html }}
      />
    </div>
  );
}
