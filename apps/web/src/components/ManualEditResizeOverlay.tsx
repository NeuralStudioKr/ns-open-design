import { useCallback, useEffect, useRef } from 'react';
import type { ManualEditKind, ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import { contentRectToHostRect, hostDeltaToContentDelta } from '../edit-mode/preview-coords';
import {
  buildResizeSessionStart,
  computeResize,
  resizeStylesForCommit,
  type ResizeHandle,
  type ResizeSessionStart,
} from '../edit-mode/resize-math';
import styles from './ManualEditResizeOverlay.module.css';

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const HANDLE_CLASS: Record<ResizeHandle, string> = {
  n: styles.handleN,
  s: styles.handleS,
  e: styles.handleE,
  w: styles.handleW,
  ne: styles.handleNE,
  nw: styles.handleNW,
  se: styles.handleSE,
  sw: styles.handleSW,
};

export type ManualEditResizeOverlayProps = {
  target: ManualEditTarget;
  previewScale: number;
  draftWidthPx: number | null;
  draftHeightPx: number | null;
  disabled?: boolean;
  onSessionStart: () => void;
  onResizePreview: (styles: Partial<ManualEditStyles>) => void;
  onResizeCommit: (styles: Partial<ManualEditStyles>, label: string) => void;
  onResizeCancel: (stylesBefore: Partial<ManualEditStyles>) => void;
};

type ActiveSession = {
  handle: ResizeHandle;
  start: ResizeSessionStart;
  kind: ManualEditKind;
  stylesBefore: Partial<ManualEditStyles>;
  originX: number;
  originY: number;
  pointerId: number;
  moved: boolean;
};

export function ManualEditResizeOverlay({
  target,
  previewScale,
  draftWidthPx,
  draftHeightPx,
  disabled = false,
  onSessionStart,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
}: ManualEditResizeOverlayProps) {
  const sessionRef = useRef<ActiveSession | null>(null);

  const hostRect = contentRectToHostRect(
    draftWidthPx != null && draftHeightPx != null
      ? {
          ...target.rect,
          width: draftWidthPx,
          height: draftHeightPx,
        }
      : target.rect,
    previewScale,
  );

  const onPointerMove = useCallback((event: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    const hostDx = event.clientX - session.originX;
    const hostDy = event.clientY - session.originY;
    if (!session.moved && Math.hypot(hostDx, hostDy) < 2) return;
    session.moved = true;
    const { dx, dy } = hostDeltaToContentDelta(hostDx, hostDy, previewScale);
    const result = computeResize({ ...session.start, dx, dy });
    onResizePreview(resizeStylesForCommit(result, session.handle));
  }, [onResizePreview, previewScale]);

  const onPointerUp = useCallback((event: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (!session.moved) {
      sessionRef.current = null;
      onResizeCancel(session.stylesBefore);
      return;
    }
    const { dx, dy } = hostDeltaToContentDelta(
      event.clientX - session.originX,
      event.clientY - session.originY,
      previewScale,
    );
    const result = computeResize({ ...session.start, dx, dy });
    sessionRef.current = null;
    onResizeCommit(resizeStylesForCommit(result, session.handle), `Resize: ${target.label}`);
  }, [onResizeCancel, onResizeCommit, onPointerMove, previewScale, target.label]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const session = sessionRef.current;
      if (!session || event.key !== 'Escape') return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      sessionRef.current = null;
      onResizeCancel(session.stylesBefore);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPointerMove, onPointerUp, onResizeCancel]);

  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (!session) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      sessionRef.current = null;
      onResizeCancel(session.stylesBefore);
    };
  }, [onPointerMove, onPointerUp, onResizeCancel]);

  function beginResize(handle: ResizeHandle, event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const stylesBefore: Partial<ManualEditStyles> = {
      width: target.styles.width,
      height: target.styles.height,
    };
    const session: ActiveSession = {
      handle,
      start: buildResizeSessionStart(target.rect, target.styles, handle, target.kind, event.shiftKey),
      kind: target.kind,
      stylesBefore,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      moved: false,
    };
    sessionRef.current = session;
    onSessionStart();
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  return (
    <div
      className={styles.manualEditResizeOverlay}
      data-testid="manual-edit-resize-overlay"
      style={{
        left: hostRect.x,
        top: hostRect.y,
        width: hostRect.width,
        height: hostRect.height,
      }}
      aria-hidden={disabled}
    >
      {HANDLES.map((handle) => (
        <button
          key={handle}
          type="button"
          className={`${styles.handle} ${HANDLE_CLASS[handle]}`}
          data-testid={`manual-edit-resize-handle-${handle}`}
          aria-label={`Resize ${handle}`}
          disabled={disabled}
          onPointerDown={(event) => beginResize(handle, event)}
        />
      ))}
    </div>
  );
}
