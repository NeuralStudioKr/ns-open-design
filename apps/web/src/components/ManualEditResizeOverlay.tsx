import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { contentRectToHostRect, hostDeltaToContentDelta } from '../edit-mode/preview-coords';
import {
  MANUAL_EDIT_RESIZE_MIN_PX,
  RESIZE_HANDLES,
  aspectLockForTarget,
  computeResize,
  cursorForResizeHandle,
  resizeResultToStyles,
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
  disabled?: boolean;
  onResizePreview: (next: Partial<ManualEditStyles>) => void;
  onResizeCommit: (next: Partial<ManualEditStyles>) => void;
  onResizeCancel: (stylesBefore: Partial<ManualEditStyles>) => void;
  onResizeSessionChange?: (active: boolean) => void;
};

type DragState = {
  pointerId: number;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  session: ResizeSessionStart;
  stylesBefore: Partial<ManualEditStyles>;
  lastStyles: Partial<ManualEditStyles>;
};

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
  disabled = false,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
  onResizeSessionChange,
}: ManualEditResizeOverlayProps) {
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const contentRect = {
    x: target.rect.x,
    y: target.rect.y,
    width: draftWidthPx ?? target.rect.width,
    height: draftHeightPx ?? target.rect.height,
  };
  const hostRect = contentRectToHostRect(contentRect, previewScale);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      const before = drag.stylesBefore;
      dragRef.current = null;
      setDragging(false);
      onResizeSessionChange?.(false);
      onResizeCancel(before);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onResizeCancel, onResizeSessionChange]);

  const boxStyle: CSSProperties = {
    left: hostRect.x,
    top: hostRect.y,
    width: Math.max(1, hostRect.width),
    height: Math.max(1, hostRect.height),
  };

  const beginDrag = (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const size = startSizeFromTarget(target);
    const aspect = size.heightPx > 0 ? size.widthPx / size.heightPx : 1;
    const stylesBefore: Partial<ManualEditStyles> = {
      width: target.styles.width,
      height: target.styles.height,
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
    };
    dragRef.current = {
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
      }),
    };
    setDragging(true);
    onResizeSessionChange?.(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
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

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    const last = drag.lastStyles;
    const before = drag.stylesBefore;
    dragRef.current = null;
    setDragging(false);
    onResizeSessionChange?.(false);
    if (commit) onResizeCommit(last);
    else onResizeCancel(before);
  };

  return (
    <div
      className={styles.overlay}
      data-testid="manual-edit-resize-overlay"
      data-dragging={dragging ? 'true' : 'false'}
      style={boxStyle}
      aria-hidden={disabled || undefined}
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
          onPointerDown={(event) => beginDrag(handle, event)}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endDrag(event, true)}
          onPointerCancel={(event) => endDrag(event, false)}
        />
      ))}
    </div>
  );
}
