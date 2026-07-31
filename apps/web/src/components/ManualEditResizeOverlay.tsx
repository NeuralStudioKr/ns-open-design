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
  canMoveTarget,
  computeMove,
  movePreviewStyles,
  moveResultToStyles,
  startPositionFromTarget,
} from '../edit-mode/move-math';
import {
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
  onResizeCommit: (next: Partial<ManualEditStyles>) => void;
  onResizeCancel: (stylesBefore: Partial<ManualEditStyles>) => void;
  /** Shared with move — autosave pause while any geometry gesture is active. */
  onResizeSessionChange?: (active: boolean) => void;
  onMovePreview?: (next: Partial<ManualEditStyles>) => void;
  onMoveCommit?: (next: Partial<ManualEditStyles>) => void;
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

  const contentRect = {
    x: draftLeftPx ?? target.rect.x,
    y: draftTopPx ?? target.rect.y,
    width: draftWidthPx ?? target.rect.width,
    height: draftHeightPx ?? target.rect.height,
  };
  const hostRect = contentRectToHostRect(contentRect, previewScale);
  const movable = !disabled && canMoveTarget(target);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      const before = drag.stylesBefore;
      const kind = drag.kind;
      dragRef.current = null;
      setDragging(false);
      setMoving(false);
      onResizeSessionChange?.(false);
      if (kind === 'resize') onResizeCancel(before);
      else onMoveCancel?.(before);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onMoveCancel, onResizeCancel, onResizeSessionChange]);

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
      onResizeSessionChange?.(false);
      // pointercancel / Escape-equivalent: never persist. pointerup commits only
      // past the jitter threshold. A plain click (no preview) must not wipe
      // unrelated pending panel styles via onMoveCancel.
      if (commit && moved) onMoveCommit?.(last);
      else if (previewed) onMoveCancel?.(before);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== 'move' || event.pointerId !== drag.pointerId) return;
      const hostDx = event.clientX - drag.startClientX;
      const hostDy = event.clientY - drag.startClientY;
      const { dx, dy } = hostDeltaToContentDelta(hostDx, hostDy, previewScale);
      const result = computeMove({
        startLeftPx: drag.startLeftPx,
        startTopPx: drag.startTopPx,
        startRect: drag.startRect,
        minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
        dx,
        dy,
        shiftKey: event.shiftKey,
      });
      // Preview every frame (incl. right/bottom clear). Commit still gates on `moved`.
      const preview = movePreviewStyles(result);
      drag.lastStyles = result.moved ? (moveResultToStyles(result) ?? preview) : preview;
      drag.moved = result.moved;
      drag.previewed = true;
      onMovePreview?.(preview);
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
  }, [onMoveCancel, onMoveCommit, onMovePreview, onResizeSessionChange, previewScale]);

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
      width: target.styles.width,
      height: target.styles.height,
      left: target.styles.left,
      top: target.styles.top,
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
      lastStyles: resizeResultToStyles({
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        x: target.rect.x,
        y: target.rect.y,
        touchedWidth: true,
        touchedHeight: true,
        leftPx: null,
        topPx: null,
      }),
    };
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
    const stylesBefore: Partial<ManualEditStyles> = {
      left: target.styles.left,
      top: target.styles.top,
      right: target.styles.right,
      bottom: target.styles.bottom,
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
    };
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
    const aspectLock = aspectLockForTarget(target.kind, event.shiftKey);
    const result = computeResize({
      ...drag.session,
      aspectLock,
      dx,
      dy,
    });
    const next = resizeResultToStyles(result);
    drag.lastStyles = next;
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
    dragRef.current = null;
    setDragging(false);
    setMoving(false);
    onResizeSessionChange?.(false);
    if (commit) onResizeCommit(last);
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
