import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  contentRectToHostRect,
  freezeGestureHostGeom,
  hostDeltaToContentDelta,
} from '../edit-mode/preview-coords';
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
  resizeHandleFromHostPoint,
  resizeResultToStyles,
  resizeFreezeContentRect,
  startAnchorFromTarget,
  startSizeFromTarget,
  type ResizeHandle,
  type ResizeSessionStart,
} from '../edit-mode/resize-math';
import type { ManualEditRect, ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import styles from './ManualEditResizeOverlay.module.css';

export type ManualEditResizeOverlayProps = {
  target: ManualEditTarget;
  /** Visual scale of the iframe inside the workspace (measured, not toolbar zoom). */
  previewScale: number;
  /**
   * Iframe top-left inside `.manual-edit-workspace`. Content rects are iframe-
   * local; overlay is workspace-local — without this offset the box drifts
   * whenever the canvas is centered / letterboxed / not at (0,0).
   */
  hostOffset?: { x: number; y: number };
  /**
   * Live host-space paint box from `measureManualEditTargetHostRect`. When set,
   * the overlay uses this for display instead of composing
   * `hostOffset + target.rect * previewScale` — that composition goes stale
   * whenever scale/offset state lags the painted iframe.
   */
  hostPaintRect?: ManualEditRect | null;
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
    viewport?: { x: number; y: number },
  ) => void;
  onResizeCancel: (stylesBefore: Partial<ManualEditStyles>) => void;
  /** Shared with move — autosave pause while any geometry gesture is active. */
  onResizeSessionChange?: (active: boolean) => void;
  /**
   * Live iframe measure at pointerdown. Prefer this over React `target` so a
   * stale visual `rect` cannot become CSS width under deck-stage fit-scale.
   */
  onResolveResizeStart?: () => {
    layoutWidth: number;
    layoutHeight: number;
    rect: ManualEditRect;
    paint: ManualEditRect | null;
  } | null;
  onMovePreview?: (next: Partial<ManualEditStyles>) => void;
  onMoveCommit?: (
    next: Partial<ManualEditStyles>,
    stylesBefore: Partial<ManualEditStyles>,
    viewport?: { x: number; y: number },
  ) => void;
  onMoveCancel?: (stylesBefore: Partial<ManualEditStyles>) => void;
};

type GestureHostGeom = {
  /** Frozen at pointerdown — live previewScale mid-drag morphs the host box. */
  hostScale: number;
  hostOffset: { x: number; y: number };
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
  lastViewport: { x: number; y: number };
} & GestureHostGeom;

type MoveDragState = {
  kind: 'move';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLeftPx: number;
  startTopPx: number;
  startRect: ManualEditTarget['rect'];
  /** Layout border-box for promote size-lock (CSS write space). */
  layoutWidthPx: number;
  layoutHeightPx: number;
  stylesBefore: Partial<ManualEditStyles>;
  lastStyles: Partial<ManualEditStyles>;
  moved: boolean;
  /** True after at least one move preview — gates cancel so jitter clicks keep pending styles. */
  previewed: boolean;
  /** 53: flow → absolute promote during this gesture. */
  promote: boolean;
  lastViewport: { x: number; y: number };
} & GestureHostGeom;

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
  hostOffset = { x: 0, y: 0 },
  hostPaintRect = null,
  draftWidthPx,
  draftHeightPx,
  draftLeftPx = null,
  draftTopPx = null,
  disabled = false,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
  onResizeSessionChange,
  onResolveResizeStart,
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
  // Keep pointer→content conversion on the scale frozen at gesture start.
  if (!dragRef.current) previewScaleRef.current = previewScale;
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

  const gestureGeom = dragRef.current;
  const composeScale = gestureGeom?.hostScale ?? previewScale;
  const composeOffset = gestureGeom?.hostOffset ?? hostOffset;
  // Two coordinate spaces must not be mixed for DISPLAY:
  // - visual: getBoundingClientRect / hostPaintRect (deck transform applied)
  // - layout: offsetWidth/Height + CSS width writes (untransformed)
  // Idle fallback used to take visual x/y + layout w/h → box grew down/right
  // under deck-stage scale while the chip sat in the top-left corner.
  // Layout-sized compose is only valid while gestureGeom freezes
  // hostScale = paint/layout.
  const layoutW = target.layoutWidth && target.layoutWidth >= 1 ? target.layoutWidth : null;
  const layoutH = target.layoutHeight && target.layoutHeight >= 1 ? target.layoutHeight : null;
  const contentRect = gestureGeom
    ? {
        x: liveViewportPos?.x ?? draftLeftPx ?? target.rect.x,
        y: liveViewportPos?.y ?? draftTopPx ?? target.rect.y,
        width: draftWidthPx ?? layoutW ?? target.rect.width,
        height: draftHeightPx ?? layoutH ?? target.rect.height,
      }
    : {
        x: draftLeftPx ?? target.rect.x,
        y: draftTopPx ?? target.rect.y,
        // Prefer visual rect. If a layout draft lingers after pointerup, map it
        // back through the visual/layout ratio instead of painting layout px.
        width: draftWidthPx != null && layoutW
          ? draftWidthPx * (target.rect.width / layoutW)
          : target.rect.width,
        height: draftHeightPx != null && layoutH
          ? draftHeightPx * (target.rect.height / layoutH)
          : target.rect.height,
      };
  const scaled = contentRectToHostRect(contentRect, composeScale);
  const composedHostRect = {
    x: composeOffset.x + scaled.x,
    y: composeOffset.y + scaled.y,
    width: scaled.width,
    height: scaled.height,
  };
  // Idle: prefer live DOM projection (survives stale scale/offset state).
  // During a previewed gesture: composed draft/liveViewport math with the
  // scale/offset frozen at pointerdown (live fit-scale remasure morphs size).
  // pointerdown alone keeps paint until the first preview — avoids a flash
  // from paint → composed before drafts exist.
  const gestureComposed = liveViewportPos != null
    || draftWidthPx != null
    || draftHeightPx != null
    || draftLeftPx != null
    || draftTopPx != null;
  const hostRect = !gestureComposed
    && hostPaintRect
    && hostPaintRect.width >= 1
    && hostPaintRect.height >= 1
    ? hostPaintRect
    : composedHostRect;
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

  const onResizePreviewRef = useRef(onResizePreview);
  onResizePreviewRef.current = onResizePreview;
  const onResizeCommitRef = useRef(onResizeCommit);
  onResizeCommitRef.current = onResizeCommit;
  const targetKindRef = useRef(target.kind);
  targetKindRef.current = target.kind;
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const endDrag = (event: PointerEvent, commit: boolean) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const last = drag.lastStyles;
      const before = drag.stylesBefore;
      const previewed = drag.previewed;
      const viewport = drag.lastViewport;
      const kind = drag.kind;
      const moved = kind === 'move' ? drag.moved : false;
      dragRef.current = null;
      onResizeSessionChangeRef.current?.(false);
      // Commit/cancel BEFORE clearing liveViewportPos. Commit applies an
      // optimistic target.rect synchronously; clearing first would flash the
      // overlay back onto the pre-gesture rect for a frame (or longer if flush
      // awaited before the optimistic update).
      if (kind === 'resize') {
        // Handle click / sub-threshold jitter: no flush, no cancel wipe.
        if (previewed) {
          if (commit) onResizeCommitRef.current(last, before, viewport);
          else onResizeCancelRef.current(before);
        }
      } else if (commit && moved) {
        // pointercancel: never persist. pointerup commits only past the jitter
        // threshold. A plain click (no preview) must not wipe pending styles.
        onMoveCommitRef.current?.(last, before, viewport);
      } else if (previewed) {
        onMoveCancelRef.current?.(before);
      }
      setDragging(false);
      setMoving(false);
      setLiveViewportPos(null);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const hostDx = event.clientX - drag.startClientX;
      const hostDy = event.clientY - drag.startClientY;
      const { dx, dy } = hostDeltaToContentDelta(hostDx, hostDy, previewScaleRef.current);

      if (drag.kind === 'resize') {
        if (Math.hypot(dx, dy) < MANUAL_EDIT_RESIZE_MIN_DELTA_PX && !drag.previewed) return;
        const aspectLock = aspectLockForTarget(targetKindRef.current, event.shiftKey);
        const result = computeResize({
          ...drag.session,
          aspectLock,
          dx,
          dy,
        });
        const next = resizeResultToStyles(result, targetRef.current);
        drag.lastStyles = next;
        drag.previewed = true;
        // result.x/y are viewport (CB left/top stay in leftPx/topPx only).
        drag.lastViewport = { x: result.x, y: result.y };
        setLiveViewportPos(drag.lastViewport);
        onResizePreviewRef.current(next);
        return;
      }

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
        const preview = promoteMoveStyles(drag.startRect, result, {
          layoutWidthPx: drag.layoutWidthPx,
          layoutHeightPx: drag.layoutHeightPx,
        });
        drag.lastStyles = preview;
        drag.previewed = true;
        drag.lastViewport = viewport;
        setLiveViewportPos(viewport);
        onMovePreviewRef.current?.(preview);
        return;
      }
      const preview = movePreviewStyles(result);
      drag.lastStyles = result.moved ? (moveResultToStyles(result) ?? preview) : preview;
      drag.previewed = true;
      drag.lastViewport = viewport;
      setLiveViewportPos(viewport);
      onMovePreviewRef.current?.(preview);
    };

    const onPointerUp = (event: PointerEvent) => endDrag(event, true);
    const onPointerCancel = (event: PointerEvent) => endDrag(event, false);

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

  const beginResize = (
    handle: ResizeHandle,
    event: Pick<
      ReactPointerEvent<Element>,
      'pointerId' | 'clientX' | 'clientY' | 'shiftKey' | 'preventDefault' | 'stopPropagation' | 'currentTarget'
    >,
  ) => {
    if (disabled || dragRef.current) return;
    // Capture-phase friendly: stop before the movable body can begin a move.
    event.preventDefault();
    event.stopPropagation();
    const live = onResolveResizeStart?.() ?? null;
    const startTarget: ManualEditTarget = live
      ? {
          ...target,
          rect: live.rect,
          layoutWidth: live.layoutWidth,
          layoutHeight: live.layoutHeight,
        }
      : target;
    const size = startSizeFromTarget(startTarget);
    const anchor = startAnchorFromTarget(startTarget);
    const aspect = size.heightPx > 0 ? size.widthPx / size.heightPx : 1;
    const stylesBefore: Partial<ManualEditStyles> = {
      width: cascadeRollbackStyle(target.styles.width),
      height: cascadeRollbackStyle(target.styles.height),
      display: cascadeRollbackStyle(target.styles.display),
      // resizeResultToStyles lifts max-width/height clamps — capture so Esc /
      // flush-fail can removeProperty and restore stylesheet constraints.
      maxWidth: cascadeRollbackStyle(target.styles.maxWidth),
      maxHeight: cascadeRollbackStyle(target.styles.maxHeight),
      left: cascadeRollbackStyle(target.styles.left),
      top: cascadeRollbackStyle(target.styles.top),
      // Loop7 clears right/bottom on resize preview — capture them so Esc /
      // flush-fail can restore authored pins (e.g. right:0) instead of
      // leaving '' in pending and autosaving the wipe.
      right: cascadeRollbackStyle(target.styles.right),
      bottom: cascadeRollbackStyle(target.styles.bottom),
    };
    const session: ResizeSessionStart = {
      // Viewport origin stays visual (gBCR); startWidth/Height are layout px.
      startRect: { ...startTarget.rect },
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
    // Freeze scale as paint/layout so hostΔ→contentΔ is layout px (CSS write
    // space), not transform-shrunk gBCR px.
    const geom = freezeGestureHostGeom(
      resizeFreezeContentRect(startTarget),
      live?.paint ?? hostPaintRect,
      previewScale,
      hostOffset,
    );
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
      lastViewport: { x: startTarget.rect.x, y: startTarget.rect.y },
      hostScale: geom.hostScale,
      hostOffset: geom.hostOffset,
    };
    previewScaleRef.current = geom.hostScale;
    setLiveViewportPos(null);
    setDragging(true);
    setMoving(false);
    onResizeSessionChange?.(true);
    try {
      (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom / older engines may lack pointer capture
    }
  };

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!movable || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    // Same live layout/paint seed as resize — mid-move compose uses layout w/h
    // and requires hostScale = paint/layout (not paint/visual).
    const live = onResolveResizeStart?.() ?? null;
    const startTarget: ManualEditTarget = live
      ? {
          ...target,
          rect: live.rect,
          layoutWidth: live.layoutWidth,
          layoutHeight: live.layoutHeight,
        }
      : target;
    const pos = startPositionFromTarget(startTarget);
    const size = startSizeFromTarget(startTarget);
    const promote = canPromoteTarget(startTarget);
    const stylesBefore: Partial<ManualEditStyles> = promote
      ? promoteMoveStylesBefore(startTarget)
      : {
          // Collapse computed auto so flush-fail / Esc removeProperty instead of
          // baking `auto !important` into the live preview.
          left: cascadeRollbackStyle(target.styles.left),
          top: cascadeRollbackStyle(target.styles.top),
          right: cascadeRollbackStyle(target.styles.right),
          bottom: cascadeRollbackStyle(target.styles.bottom),
        };
    const geom = freezeGestureHostGeom(
      resizeFreezeContentRect(startTarget),
      live?.paint ?? hostPaintRect,
      previewScale,
      hostOffset,
    );
    dragRef.current = {
      kind: 'move',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeftPx: pos.startLeftPx,
      startTopPx: pos.startTopPx,
      startRect: { ...startTarget.rect },
      layoutWidthPx: size.widthPx,
      layoutHeightPx: size.heightPx,
      stylesBefore,
      lastStyles: {
        left: `${pos.startLeftPx}px`,
        top: `${pos.startTopPx}px`,
      },
      moved: false,
      previewed: false,
      promote,
      lastViewport: { x: startTarget.rect.x, y: startTarget.rect.y },
      hostScale: geom.hostScale,
      hostOffset: geom.hostOffset,
    };
    previewScaleRef.current = geom.hostScale;
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

  /**
   * Resize wins on the border band; move only in the clear interior.
   * Box/element drift made users aim at the visual edge and hit the movable
   * body — which felt like "resize always becomes move".
   */
  const onOverlayPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || dragRef.current) return;
    if ((event.target as HTMLElement | null)?.closest?.('[data-handle]')) return;
    const box = event.currentTarget.getBoundingClientRect();
    const edge = resizeHandleFromHostPoint(
      event.clientX - box.left,
      event.clientY - box.top,
      box.width,
      box.height,
    );
    if (edge) {
      beginResize(edge, event);
      return;
    }
    if (movable) beginMove(event);
  };

  const onOverlayPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || dragRef.current || moving) return;
    if ((event.target as HTMLElement | null)?.closest?.('[data-handle]')) return;
    const box = event.currentTarget.getBoundingClientRect();
    const edge = resizeHandleFromHostPoint(
      event.clientX - box.left,
      event.clientY - box.top,
      box.width,
      box.height,
    );
    event.currentTarget.style.cursor = edge
      ? cursorForResizeHandle(edge)
      : (movable ? 'grab' : 'default');
  };

  return (
    <div
      className={[
        styles.overlay,
        disabled ? '' : styles.interactive,
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
      onPointerDown={disabled ? undefined : onOverlayPointerDown}
      onPointerMove={disabled ? undefined : onOverlayPointerMove}
    >
      {RESIZE_HANDLES.map((handle) => (
        <button
          key={handle}
          type="button"
          className={styles.handle}
          data-testid={`manual-edit-resize-handle-${handle}`}
          data-handle={handle}
          aria-label={`Resize ${handle}`}
          // Avoid HTML `disabled` — it drops pointer hits through to the
          // movable overlay body, so edge drags become moves.
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          style={{
            ...handlePositionStyle(handle),
            cursor: disabled ? 'default' : cursorForResizeHandle(handle),
          }}
          onPointerDownCapture={(event) => beginResize(handle, event)}
        />
      ))}
    </div>
  );
}
