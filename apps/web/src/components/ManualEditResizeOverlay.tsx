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
  isFlowImagePromoteTarget,
  manualEditHostPaintRectStale,
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
import {
  snapMoveDelta,
  type SnapGuide,
  type SnapSource,
} from '../edit-mode/manual-edit-geometry-snap';
import type { ManualEditRect, ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import { ManualEditSnapGuides } from './ManualEditSnapGuides';
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
  /**
   * Tip remount: keep host paint even when it disagrees with composed
   * target.rect (fit/tip lag) so chrome does not flash to composed (526).
   */
  trustHostPaintDespiteStale?: boolean;
  /** Live draft size while dragging; null uses target.rect. */
  draftWidthPx: number | null;
  draftHeightPx: number | null;
  /** Live draft position while moving; null uses target.rect. */
  draftLeftPx?: number | null;
  draftTopPx?: number | null;
  disabled?: boolean;
  /** Tip remount: track pointer over chrome so late geometry apply can defer (516). */
  onChromePointerHoverChange?: (hovering: boolean) => void;
  onResizePreview: (next: Partial<ManualEditStyles>) => void;
  /** Commit passes `stylesBefore` so a failed flush can keyed-rollback the live preview. */
  onResizeCommit: (
    next: Partial<ManualEditStyles>,
    stylesBefore: Partial<ManualEditStyles>,
    viewport?: { x: number; y: number },
  ) => void | Promise<void>;
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
  onMovePreview?: (next: Partial<ManualEditStyles>, viewport?: { x: number; y: number }) => void;
  onMoveCommit?: (
    next: Partial<ManualEditStyles>,
    stylesBefore: Partial<ManualEditStyles>,
    viewport?: { x: number; y: number },
  ) => void | Promise<void>;
  onMoveCancel?: (stylesBefore: Partial<ManualEditStyles>) => void;
  /**
   * Absolute/fixed text stays movable (overlay body captures pointers). Forward
   * dblclick so the iframe can still enter contenteditable.
   */
  onStartTextEdit?: (targetId: string) => void;
  snapSources?: readonly SnapSource[];
  snapEnabled?: boolean;
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
  /**
   * pointerup/cancel started commit/cancel — keep freeze geom for overlay
   * compose until the async host handoff finishes; ignore further moves.
   */
  sealed?: boolean;
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
  /** 53: flow → relative/absolute promote during this gesture. */
  promote: boolean;
  /** Pre-promote cssPosition (`static` / `relative` / `sticky`) for promote styles. */
  promoteCssPosition: string;
  /** Inline flow images use absolute + size lock (not relative offsets). */
  imagePromote: boolean;
  lastViewport: { x: number; y: number };
  lastGuides: SnapGuide[];
  /** See ResizeDragState.sealed. */
  sealed?: boolean;
} & GestureHostGeom;

type DragState = ResizeDragState | MoveDragState;

function usablePaintRect(rect: ManualEditRect | null | undefined): ManualEditRect | null {
  return rect && rect.width >= 1 && rect.height >= 1 ? rect : null;
}

function syntheticPaintRectFromTarget(
  target: ManualEditTarget,
  previewScale: number,
  hostOffset: { x: number; y: number },
): ManualEditRect | null {
  if (!(target.rect.width >= 1) || !(target.rect.height >= 1)) return null;
  const scaled = contentRectToHostRect(target.rect, previewScale);
  return {
    x: hostOffset.x + scaled.x,
    y: hostOffset.y + scaled.y,
    width: scaled.width,
    height: scaled.height,
  };
}

function gesturePaintRectForTarget(
  target: ManualEditTarget,
  livePaint: ManualEditRect | null | undefined,
  hostPaintRect: ManualEditRect | null | undefined,
  previewScale: number,
  hostOffset: { x: number; y: number },
): ManualEditRect | null {
  return usablePaintRect(livePaint)
    ?? usablePaintRect(hostPaintRect)
    ?? syntheticPaintRectFromTarget(target, previewScale, hostOffset);
}

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
  trustHostPaintDespiteStale = false,
  draftWidthPx,
  draftHeightPx,
  draftLeftPx = null,
  draftTopPx = null,
  disabled = false,
  onChromePointerHoverChange,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
  onResizeSessionChange,
  onResolveResizeStart,
  onMovePreview,
  onMoveCommit,
  onMoveCancel,
  onStartTextEdit,
  snapSources = [],
  snapEnabled = true,
}: ManualEditResizeOverlayProps) {
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  /** Viewport-space overlay origin during promote (CSS left/top are CB-relative). */
  const [liveViewportPos, setLiveViewportPos] = useState<{ x: number; y: number } | null>(null);
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
  const snapSourcesRef = useRef(snapSources);
  snapSourcesRef.current = snapSources;
  const snapEnabledRef = useRef(snapEnabled);
  snapEnabledRef.current = snapEnabled;

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
  // Move drafts are hybrid (visualStart + layoutΔ). Only compose them while
  // gestureGeom freezes hostScale=paint/layout. Idle + hybrid×previewScale(~1)
  // is the classic post-pointerup jump under deck fit-scale.
  const contentRect = gestureGeom
    ? {
        x: liveViewportPos?.x ?? draftLeftPx ?? target.rect.x,
        y: liveViewportPos?.y ?? draftTopPx ?? target.rect.y,
        width: draftWidthPx ?? layoutW ?? target.rect.width,
        height: draftHeightPx ?? layoutH ?? target.rect.height,
      }
    : {
        x: target.rect.x,
        y: target.rect.y,
        // Prefer visual rect. If a layout size draft lingers after pointerup,
        // map it back through the visual/layout ratio instead of painting layout px.
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
  // Position drafts are hybrid — only compose them under gesture freeze.
  // Size drafts may still compose idle (panel width/height) via visual ratio.
  const gestureComposed = gestureGeom
    ? (
      liveViewportPos != null
      || draftWidthPx != null
      || draftHeightPx != null
      || draftLeftPx != null
      || draftTopPx != null
    )
    : (draftWidthPx != null || draftHeightPx != null || draftLeftPx != null || draftTopPx != null);
  const hostPaintLooksStale = Boolean(
    hostPaintRect
    && hostPaintRect.width >= 1
    && hostPaintRect.height >= 1
    && !trustHostPaintDespiteStale
    && manualEditHostPaintRectStale(hostPaintRect, composedHostRect),
  );
  const hostRect = !gestureComposed
    && hostPaintRect
    && hostPaintRect.width >= 1
    && hostPaintRect.height >= 1
    && !hostPaintLooksStale
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
      setSnapGuides([]);
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
      if (!drag || drag.sealed || event.pointerId !== drag.pointerId) return;
      const last = drag.lastStyles;
      const before = drag.stylesBefore;
      const previewed = drag.previewed;
      const viewport = drag.lastViewport;
      const kind = drag.kind;
      const moved = kind === 'move' ? drag.moved : false;
      // Seal + keep freeze/liveViewport until async host handoff finishes.
      // Clearing dragRef first painted hybrid viewport × iframe scale (jump),
      // and unlocking mid-await let RAF remasure clobber the optimistic box.
      drag.sealed = true;
      const finish = () => {
        if (dragRef.current === drag) dragRef.current = null;
        onResizeSessionChangeRef.current?.(false);
        setDragging(false);
        setMoving(false);
        setLiveViewportPos(null);
        setSnapGuides([]);
      };
      void (async () => {
        try {
          if (kind === 'resize') {
            // Handle click / sub-threshold jitter: no flush, no cancel wipe.
            if (previewed) {
              if (commit) await Promise.resolve(onResizeCommitRef.current(last, before, viewport));
              else onResizeCancelRef.current(before);
            }
          } else if (commit && moved) {
            // pointercancel: never persist. pointerup commits only past the jitter
            // threshold. A plain click (no preview) must not wipe pending styles.
            await Promise.resolve(onMoveCommitRef.current?.(last, before, viewport));
          } else if (previewed) {
            onMoveCancelRef.current?.(before);
          }
        } finally {
          // Let the parent commit hostPaintRect / target.rect before idle compose.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              finish();
            });
          });
        }
      })();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.sealed || event.pointerId !== drag.pointerId) return;
      const hostDx = event.clientX - drag.startClientX;
      const hostDy = event.clientY - drag.startClientY;
      let { dx, dy } = hostDeltaToContentDelta(hostDx, hostDy, drag.hostScale);

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

      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (snapEnabledRef.current && snapSourcesRef.current.length > 0) {
        const snapped = snapMoveDelta(drag.startRect, dx, dy, snapSourcesRef.current);
        dx = snapped.dx;
        dy = snapped.dy;
        drag.lastGuides = snapped.guides;
        setSnapGuides(snapped.guides);
      } else {
        drag.lastGuides = [];
        setSnapGuides([]);
      }

      const result = computeMove({
        startLeftPx: drag.startLeftPx,
        startTopPx: drag.startTopPx,
        startRect: drag.startRect,
        minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
        dx,
        dy,
        shiftKey: false,
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
      // Absolute and promote moves share the threshold gate — 1px jitter must
      // not mark previewed (that made pointerup cancel wipe left/top drafts).
      if (!result.moved) {
        setSnapGuides([]);
        return;
      }
      if (drag.promote) {
        const preview = promoteMoveStyles(drag.startRect, result, {
          layoutWidthPx: drag.layoutWidthPx,
          layoutHeightPx: drag.layoutHeightPx,
          cssPosition: drag.promoteCssPosition,
          imagePromote: drag.imagePromote,
        });
        drag.lastStyles = preview;
        drag.previewed = true;
        drag.lastViewport = viewport;
        setLiveViewportPos(viewport);
        onMovePreviewRef.current?.(preview, viewport);
        return;
      }
      const preview = movePreviewStyles(result);
      drag.lastStyles = moveResultToStyles(result) ?? preview;
      drag.previewed = true;
      drag.lastViewport = viewport;
      setLiveViewportPos(viewport);
      onMovePreviewRef.current?.(preview, viewport);
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
      // Parent may unmount the overlay mid-drag (dismiss / reselect). End the
      // session so autosave pause cannot stick; leave commit/cancel to FileViewer
      // force-flush / discard paths.
      if (dragRef.current) {
        dragRef.current = null;
        onResizeSessionChangeRef.current?.(false);
      }
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
      gesturePaintRectForTarget(startTarget, live?.paint, hostPaintRect, previewScale, hostOffset),
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
    // Freeze display origin immediately at pointerdown. The parent can remeasure
    // / rerender with stale paint while the pointer is still below threshold;
    // if hostPaintRect wins during that window the selection box appears to
    // jump before the user has actually resized.
    setLiveViewportPos({ x: startTarget.rect.x, y: startTarget.rect.y });
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
    const imagePromote = isFlowImagePromoteTarget(startTarget);
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
      gesturePaintRectForTarget(startTarget, live?.paint, hostPaintRect, previewScale, hostOffset),
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
      promoteCssPosition: String(startTarget.cssPosition ?? 'static'),
      imagePromote,
      lastViewport: { x: startTarget.rect.x, y: startTarget.rect.y },
      lastGuides: [],
      hostScale: geom.hostScale,
      hostOffset: geom.hostOffset,
    };
    // Same immediate freeze as resize. Move preview starts after the jitter
    // threshold, but the overlay must stay pinned to the pointerdown geometry
    // through any parent fit/paint rerender before that first preview.
    setLiveViewportPos({ x: startTarget.rect.x, y: startTarget.rect.y });
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
    <>
    <ManualEditSnapGuides
      guides={snapGuides}
      previewScale={composeScale}
      hostOffset={composeOffset}
    />
    <div
      className={[
        styles.overlay,
        // Resize needs pointer events on the overlay body for edge hit-testing
        // even when the target cannot move (flow images / inline SVG).
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
      onPointerEnter={onChromePointerHoverChange
        ? () => onChromePointerHoverChange(true)
        : undefined}
      onPointerLeave={onChromePointerHoverChange
        ? () => onChromePointerHoverChange(false)
        : undefined}
      onPointerDown={disabled ? undefined : onOverlayPointerDown}
      onPointerMove={disabled ? undefined : onOverlayPointerMove}
      onDoubleClick={disabled || (target.kind !== 'text' && target.kind !== 'link')
        ? undefined
        : (event) => {
            event.preventDefault();
            event.stopPropagation();
            onStartTextEdit?.(target.id);
          }}
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
    </>
  );
}
