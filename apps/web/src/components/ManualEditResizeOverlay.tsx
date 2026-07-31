import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { contentRectToHostRect, hostDeltaToContentDelta } from '../edit-mode/preview-coords';
import {
  MANUAL_EDIT_MOVE_MIN_DELTA_PX,
  canMoveOrPromoteTarget,
  canPromoteTarget,
  cascadeRollbackStyle,
  computeMove,
  movePreviewStyles,
  moveResultToStyles,
  promoteMoveStyles,
  promoteMoveStylesBefore,
  promoteViewportDraft,
  startPositionFromTarget,
} from '../edit-mode/move-math';
import {
  MANUAL_EDIT_RESIZE_MIN_DELTA_PX,
  MANUAL_EDIT_RESIZE_MIN_PX,
  RESIZE_HANDLES,
  aspectLockForTarget,
  computeResize,
  cursorForResizeHandle,
  resizeResultToStyles,
  startAnchorFromTarget,
  startSizeFromTarget,
  type ResizeHandle,
  type ResizeSessionStart,
} from '../edit-mode/resize-math';
import type { ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import styles from './ManualEditResizeOverlay.module.css';

export type ManualEditResizeOverlayProps = {
  target: ManualEditTarget;
  previewScale: number;
  /** Live draft size while dragging; null uses target.rect. */
  draftWidthPx: number | null;
  draftHeightPx: number | null;
  /** Live draft position while moving; null uses target.rect. */
  draftLeftPx?: number | null;
  draftTopPx?: number | null;
  disabled?: boolean;
  onResizePreview: (next: Partial<ManualEditStyles>) => void;
  /** Commit passes `stylesBefore` so a failed flush can keyed-rollback the live preview. */
  onResizeCommit: (
    next: Partial<ManualEditStyles>,
    stylesBefore: Partial<ManualEditStyles>,
  ) => void;
  onResizeCancel: (stylesBefore: Partial<ManualEditStyles>) => void;
  /** Shared with move — autosave pause while any geometry gesture is active. */
  onResizeSessionChange?: (active: boolean) => void;
  onMovePreview?: (next: Partial<ManualEditStyles>) => void;
  onMoveCommit?: (
    next: Partial<ManualEditStyles>,
    stylesBefore: Partial<ManualEditStyles>,
  ) => void;
  onMoveCancel?: (stylesBefore: Partial<ManualEditStyles>) => void;
};

type ResizeDragState = {
  kind: 'resize';
  pointerId: number;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  session: ResizeSessionStart;
  stylesBefore: Partial<ManualEditStyles>;
  lastStyles: Partial<ManualEditStyles>;
  /** True after pointer moved past jitter — gates commit/Esc like move. */
  previewed: boolean;
};

type MoveDragState = {
  kind: 'move';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLeftPx: number;
  startTopPx: number;
  startRect: ManualEditTarget['rect'];
  stylesBefore: Partial<ManualEditStyles>;
  lastStyles: Partial<ManualEditStyles>;
  moved: boolean;
  /** True after at least one move preview — gates cancel so jitter clicks keep pending styles. */
  previewed: boolean;
  /** 53: flow → absolute promote during this gesture. */
  promote: boolean;
};

type DragState = ResizeDragState | MoveDragState;

function handlePositionStyle(handle: ResizeHandle): CSSProperties {
  const mid = '50%';
  switch (handle) {
    case 'n': return { left: mid, top: 0 };
    case 's': return { left: mid, top: '100%' };
    case 'e': return { left: '100%', top: mid };
    case 'w': return { left: 0, top: mid };
    case 'ne': return { left: '100%', top: 0 };
    case 'nw': return { left: 0, top: 0 };
    case 'se': return { left: '100%', top: '100%' };
    case 'sw': return { left: 0, top: '100%' };
    default: return {};
  }
}

export function ManualEditResizeOverlay({
  target,
  previewScale,
  draftWidthPx,
  draftHeightPx,
  draftLeftPx = null,
  draftTopPx = null,
  disabled = false,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
  onResizeSessionChange,
  onMovePreview,
  onMoveCommit,
  onMoveCancel,
}: ManualEditResizeOverlayProps) {
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  /** Viewport-space overlay origin during promote (CSS left/top are CB-relative). */
  const [liveViewportPos, setLiveViewportPos] = useState<{ x: number; y: number } | null>(null);
  const previewScaleRef = useRef(previewScale);
  previewScaleRef.current = previewScale;
  const onMovePreviewRef = useRef(onMovePreview);
  onMovePreviewRef.current = onMovePreview;
  const onMoveCommitRef = useRef(onMoveCommit);
  onMoveCommitRef.current = onMoveCommit;
  const onMoveCancelRef = useRef(onMoveCancel);
  onMoveCancelRef.current = onMoveCancel;
  const onResizeCancelRef = useRef(onResizeCancel);
  onResizeCancelRef.current = onResizeCancel;
  const onResizeSessionChangeRef = useRef(onResizeSessionChange);
  onResizeSessionChangeRef.current = onResizeSessionChange;

  const contentRect = {
    x: liveViewportPos?.x ?? draftLeftPx ?? target.rect.x,
    y: liveViewportPos?.y ?? draftTopPx ?? target.rect.y,
    width: draftWidthPx ?? target.rect.width,
    height: draftHeightPx ?? target.rect.height,
  };
  const hostRect = contentRectToHostRect(contentRect, previewScale);
  const movable = !disabled && canMoveOrPromoteTarget(target);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      const before = drag.stylesBefore;
      const kind = drag.kind;
      const previewed = drag.previewed;
      dragRef.current = null;
      setDragging(false);
      setMoving(false);
      setLiveViewportPos(null);
      onResizeSessionChangeRef.current?.(false);
      // Bare click+Esc must not wipe panel drafts / bake computed styles.
      if (!previewed) return;
      if (kind === 'resize') onResizeCancelRef.current(before);
      else onMoveCancelRef.current?.(before);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    const endMove = (event: PointerEvent, commit: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== 'move' || event.pointerId !== drag.pointerId) return;
      const last = drag.lastStyles;
      const before = drag.stylesBefore;
      const moved = drag.moved;
      const previewed = drag.previewed;
      dragRef.current = null;
      setDragging(false);
      setMoving(false);
      setLiveViewportPos(null);
      onResizeSessionChangeRef.current?.(false);
      // pointercancel: never persist. pointerup commits only past the jitter
      // threshold. A plain click (no preview) must not wipe pending styles.
      // Pass stylesBefore so flush-fail can mirror Esc keyed rollback.
      if (commit && moved) onMoveCommitRef.current?.(last, before);
      else if (previewed) onMoveCancelRef.current?.(before);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== 'move' || event.pointerId !== drag.pointerId) return;
      const hostDx = event.clientX - drag.startClientX;
      const hostDy = event.clientY - drag.startClientY;
      const { dx, dy } = hostDeltaToContentDelta(hostDx, hostDy, previewScaleRef.current);
      const result = computeMove({
        startLeftPx: drag.startLeftPx,
        startTopPx: drag.startTopPx,
        startRect: drag.startRect,
        minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
        dx,
        dy,
        shiftKey: event.shiftKey,
      });
      drag.moved = result.moved;
      // Viewport overlay tracks startRect+Δ for every body-drag. CSS left/top
      // are CB-relative for absolute/fixed and for in-flight promote — never
      // drive the host box from those values (post-promote re-drag / nested CB).
      const viewport = promoteViewportDraft(
        drag.startRect,
        drag.startLeftPx,
        drag.startTopPx,
        result,
      );
      // Promote styles only after the move threshold — avoids flash + Esc wiping
      // panel SIZE drafts on a plain click (53 review).
      if (drag.promote) {
        if (!result.moved) return;
        const preview = promoteMoveStyles(drag.startRect, result);
        drag.lastStyles = preview;
        drag.previewed = true;
        setLiveViewportPos(viewport);
        onMovePreviewRef.current?.(preview);
        return;
      }
      const preview = movePreviewStyles(result);
      drag.lastStyles = result.moved ? (moveResultToStyles(result) ?? preview) : preview;
      drag.previewed = true;
      setLiveViewportPos(viewport);
      onMovePreviewRef.current?.(preview);
    };

    const onPointerUp = (event: PointerEvent) => endMove(event, true);
    const onPointerCancel = (event: PointerEvent) => endMove(event, false);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, []);

  const boxStyle: CSSProperties = {
    left: hostRect.x,
    top: hostRect.y,
    width: Math.max(1, hostRect.width),
    height: Math.max(1, hostRect.height),
  };

  const beginResize = (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const size = startSizeFromTarget(target);
    const anchor = startAnchorFromTarget(target);
    const aspect = size.heightPx > 0 ? size.widthPx / size.heightPx : 1;
    const stylesBefore: Partial<ManualEditStyles> = {
      width: cascadeRollbackStyle(target.styles.width),
      height: cascadeRollbackStyle(target.styles.height),
      left: cascadeRollbackStyle(target.styles.left),
      top: cascadeRollbackStyle(target.styles.top),
    };
    const session: ResizeSessionStart = {
      startRect: { ...target.rect },
      startWidthPx: size.widthPx,
      startHeightPx: size.heightPx,
      aspect,
      handle,
      aspectLock: aspectLockForTarget(target.kind, event.shiftKey),
      minWidth: MANUAL_EDIT_RESIZE_MIN_PX,
      minHeight: MANUAL_EDIT_RESIZE_MIN_PX,
      anchorPosition: anchor.anchorPosition,
      startLeftPx: anchor.startLeftPx,
      startTopPx: anchor.startTopPx,
    };
    dragRef.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      session,
      stylesBefore,
      lastStyles: {},
      previewed: false,
    };
    setLiveViewportPos(null);
    setDragging(true);
    setMoving(false);
    onResizeSessionChange?.(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom / older engines may lack pointer capture
    }
  };

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!movable || dragRef.current) return;
    if ((event.target as HTMLElement | null)?.closest?.('[data-handle]')) return;
    event.preventDefault();
    event.stopPropagation();
    const pos = startPositionFromTarget(target);
    const promote = canPromoteTarget(target);
    const stylesBefore: Partial<ManualEditStyles> = promote
      ? promoteMoveStylesBefore(target)
      : {
          // Collapse computed auto so flush-fail / Esc removeProperty instead of
          // baking `auto !important` into the live preview.
          left: cascadeRollbackStyle(target.styles.left),
          top: cascadeRollbackStyle(target.styles.top),
          right: cascadeRollbackStyle(target.styles.right),
          bottom: cascadeRollbackStyle(target.styles.bottom),
        };
    dragRef.current = {
      kind: 'move',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeftPx: pos.startLeftPx,
      startTopPx: pos.startTopPx,
      startRect: { ...target.rect },
      stylesBefore,
      lastStyles: {
        left: `${pos.startLeftPx}px`,
        top: `${pos.startTopPx}px`,
      },
      moved: false,
      previewed: false,
      promote,
    };
    setLiveViewportPos(null);
    setDragging(true);
    setMoving(true);
    onResizeSessionChange?.(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom / older engines may lack pointer capture
    }
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== 'resize' || event.pointerId !== drag.pointerId) return;
    const hostDx = event.clientX - drag.startClientX;
    const hostDy = event.clientY - drag.startClientY;
    const { dx, dy } = hostDeltaToContentDelta(hostDx, hostDy, previewScale);
    if (Math.hypot(dx, dy) < MANUAL_EDIT_RESIZE_MIN_DELTA_PX && !drag.previewed) return;
    const aspectLock = aspectLockForTarget(target.kind, event.shiftKey);
    const result = computeResize({
      ...drag.session,
      aspectLock,
      dx,
      dy,
    });
    const next = resizeResultToStyles(result);
    drag.lastStyles = next;
    drag.previewed = true;
    // result.x/y are viewport (CB left/top stay in leftPx/topPx only).
    setLiveViewportPos({ x: result.x, y: result.y });
    onResizePreview(next);
  };

  const endResize = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== 'resize' || event.pointerId !== drag.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // already released / unsupported
    }
    const last = drag.lastStyles;
    const before = drag.stylesBefore;
    const previewed = drag.previewed;
    dragRef.current = null;
    setDragging(false);
    setMoving(false);
    setLiveViewportPos(null);
    onResizeSessionChange?.(false);
    // Handle click / sub-threshold jitter: no flush, no cancel wipe.
    if (!previewed) return;
    if (commit) onResizeCommit(last, before);
    else onResizeCancel(before);
  };

  return (
    <div
      className={[
        styles.overlay,
        movable ? styles.movable : '',
        moving ? styles.moving : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="manual-edit-resize-overlay"
      data-dragging={dragging ? 'true' : 'false'}
      data-moving={moving ? 'true' : 'false'}
      data-movable={movable ? 'true' : 'false'}
      style={boxStyle}
      aria-hidden={disabled || undefined}
      onPointerDown={movable ? beginMove : undefined}
    >
      {RESIZE_HANDLES.map((handle) => (
        <button
          key={handle}
          type="button"
          className={styles.handle}
          data-testid={`manual-edit-resize-handle-${handle}`}
          data-handle={handle}
          aria-label={`Resize ${handle}`}
          disabled={disabled}
          style={{
            ...handlePositionStyle(handle),
            cursor: disabled ? 'default' : cursorForResizeHandle(handle),
          }}
          onPointerDown={(event) => beginResize(handle, event)}
          onPointerMove={onResizePointerMove}
          onPointerUp={(event) => endResize(event, true)}
          onPointerCancel={(event) => endResize(event, false)}
        />
      ))}
    </div>
  );
}
