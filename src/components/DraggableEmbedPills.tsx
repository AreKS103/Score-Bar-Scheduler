'use client';

/**
 * DraggableEmbedPills
 *
 * Horizontally-ordered pills with iOS-style drag-to-reorder:
 * - Hold and drag any pill — it lifts and follows the cursor
 * - Other pills shift left/right (by exact pill width + gap) to show where it will land
 * - Releasing commits the new order via onReorder
 * - 5px movement threshold prevents accidental drags on clicks
 * - Double-click still opens the rename input
 */

import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmbedInstance {
  display_id: string;
  embed_id: string | null;
}

interface Props {
  instances: EmbedInstance[];
  publishTarget: string;
  renamingId: string | null;
  renameValue: string;
  onSelect: (value: string) => void;
  onDoubleClick: (value: string, displayId: string) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: (value: string) => void;
  onRenameCancel: () => void;
  onReorder: (next: EmbedInstance[]) => void;
  onDelete?: (embedId: string) => void;
}

interface DragState {
  dragIndex: number;
  hoverIndex: number;
  offsetX: number;
}

const GAP = 6;        // matches gap-1.5 (Tailwind: 1.5 × 4px = 6px)
const THRESHOLD = 5;  // px of movement before drag initiates

export default function DraggableEmbedPills({
  instances,
  publishTarget,
  renamingId,
  renameValue,
  onSelect,
  onDoubleClick,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onReorder,
  onDelete,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Suppresses CSS transitions for the render cycle immediately after a drop,
  // preventing the "slide-left" glitch where pills animate from their dragged
  // positions back to 0 after the order has already changed.
  const [suppressTransition, setSuppressTransition] = useState(false);

  // Refs — avoid stale closures in pointer handlers
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const pillRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rectsRef = useRef<DOMRect[]>([]);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);   // true once THRESHOLD exceeded
  const activeIdxRef = useRef(-1);     // which pill is currently being grabbed
  // Manual double-click tracking (needed because pointer capture on the wrapper div
  // prevents click events from reaching the inner button's onClick handler).
  const lastClickRef = useRef<{ idx: number; time: number }>({ idx: -1, time: 0 });

  // ── Hover index calculation ──────────────────────────────────────────────
  function computeHoverIndex(dragIdx: number, currentCenterX: number): number {
    let idx = 0;
    for (let i = 0; i < rectsRef.current.length; i++) {
      if (i === dragIdx) continue;
      const center = rectsRef.current[i].left + rectsRef.current[i].width / 2;
      if (currentCenterX > center) idx++;
    }
    return Math.max(0, Math.min(instances.length - 1, idx));
  }

  // ── Transform calculation per pill ──────────────────────────────────────
  function getTranslateX(i: number): number {
    if (!drag) return 0;
    const { dragIndex, hoverIndex, offsetX } = drag;
    if (i === dragIndex) return offsetX;

    const draggedWidth = rectsRef.current[dragIndex]?.width ?? 0;
    const shift = draggedWidth + GAP;

    if (dragIndex < hoverIndex) {
      // Moving right — pills in between shift left
      if (i > dragIndex && i <= hoverIndex) return -shift;
    } else if (dragIndex > hoverIndex) {
      // Moving left — pills in between shift right
      if (i >= hoverIndex && i < dragIndex) return shift;
    }
    return 0;
  }

  // ── Pointer handlers ────────────────────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, i: number) {
    if (e.button !== 0 || renamingId) return;
    // Capture so all subsequent pointer events come here even if cursor leaves the element
    e.currentTarget.setPointerCapture(e.pointerId);
    rectsRef.current = pillRefs.current.map(r => r?.getBoundingClientRect() ?? new DOMRect());
    startXRef.current = e.clientX;
    draggingRef.current = false;
    activeIdxRef.current = i;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>, i: number) {
    if (activeIdxRef.current !== i) return;
    const offsetX = e.clientX - startXRef.current;

    if (!draggingRef.current) {
      if (Math.abs(offsetX) < THRESHOLD) return;
      // Threshold exceeded — initiate drag
      draggingRef.current = true;
      setDrag({ dragIndex: i, hoverIndex: i, offsetX: 0 });
      return;
    }

    const rect = rectsRef.current[i];
    const currentCenterX = rect.left + rect.width / 2 + offsetX;
    const hoverIndex = computeHoverIndex(i, currentCenterX);
    const next: DragState = { dragIndex: i, hoverIndex, offsetX };
    dragRef.current = next;
    setDrag(next);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>, i: number) {
    if (activeIdxRef.current !== i) return;
    activeIdxRef.current = -1;

    if (!draggingRef.current) {
      // setPointerCapture on the wrapper div redirects pointerup to it, so the
      // browser never fires click on the inner <button>. Handle selection and
      // double-click detection here instead.
      const inst = instances[i];
      const value = inst.embed_id ?? inst.display_id;
      const now = Date.now();
      const last = lastClickRef.current;
      if (last.idx === i && now - last.time < 300) {
        // Double-click — open rename
        lastClickRef.current = { idx: -1, time: 0 };
        onDoubleClick(value, inst.display_id);
      } else {
        lastClickRef.current = { idx: i, time: now };
        onSelect(value);
      }
      return;
    }

    draggingRef.current = false;

    const finalDrag = dragRef.current;
    dragRef.current = null;

    if (!finalDrag || finalDrag.dragIndex === finalDrag.hoverIndex) {
      setDrag(null);
      return;
    }

    // Suppress transitions for the drop render so pills snap instantly to their
    // new positions instead of animating from their dragged offsets back to 0.
    setSuppressTransition(true);
    setDrag(null);

    const next = [...instances];
    const [removed] = next.splice(finalDrag.dragIndex, 1);
    next.splice(finalDrag.hoverIndex, 0, removed);
    onReorder(next);

    // Re-enable transitions after one frame (new positions are painted).
    requestAnimationFrame(() => setSuppressTransition(false));
  }

  function handlePointerCancel() {
    activeIdxRef.current = -1;
    draggingRef.current = false;
    setDrag(null);
  }

  return (
    <div className="flex items-center gap-1.5">
      {instances.map((inst, i) => {
        const value = inst.embed_id ?? inst.display_id;
        const isRenaming = renamingId === value;
        const isDragging = drag?.dragIndex === i;
        const tx = getTranslateX(i);

        return (
          <div
            key={inst.display_id}
            ref={el => { pillRefs.current[i] = el; }}
            className="inline-flex relative group"
            style={{
              transform: `translateX(${tx}px)`,
              transition: (isDragging || suppressTransition)
                ? 'none'
                : 'transform 180ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              zIndex: isDragging ? 50 : undefined,
              position: 'relative',
            }}
            onPointerDown={e => handlePointerDown(e, i)}
            onPointerMove={e => handlePointerMove(e, i)}
            onPointerUp={e => handlePointerUp(e, i)}
            onPointerCancel={handlePointerCancel}
          >
            {isRenaming ? (
              <input
                autoFocus
                className="text-[11px] px-2 py-0.5 rounded-full border border-primary bg-background text-foreground outline-none w-24"
                value={renameValue}
                onChange={e => onRenameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onRenameCommit(value);
                  if (e.key === 'Escape') onRenameCancel();
                }}
                onBlur={() => onRenameCommit(value)}
              />
            ) : (
              <>
                <button
                  draggable={false}
                  title={drag ? undefined : 'Double-click to rename — drag to reorder'}
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-full border select-none touch-none',
                    isDragging
                      ? cn(
                          'cursor-grabbing',
                          publishTarget === value
                            ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-black/40 scale-105'
                            : 'bg-background border-border text-muted-foreground shadow-lg shadow-black/40 scale-105',
                        )
                      : cn(
                          'cursor-grab transition-all',
                          publishTarget === value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                        ),
                  )}
                >
                  {inst.display_id}
                </button>
                {onDelete && (
                  <button
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 z-10 hidden group-hover:flex"
                    title={`Remove "${inst.display_id}" embed registration`}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onDelete(inst.embed_id ?? '__null__'); }}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
