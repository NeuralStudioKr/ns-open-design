import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  buildGroupMoveMemberStarts,
  computeGroupMovePreviewUpdates,
  groupMoveDeltaMoved,
  groupMoveStylesBefore,
  type GroupMoveMemberStart,
  type GroupMovePreviewUpdate,
} from '../edit-mode/manual-edit-group-move';
import {
  buildGroupResizeMemberStarts,
  computeGroupResizePreviewUpdates,
  groupResizeDeltaMoved,
  groupResizeStylesBefore,
  unionRectFromMemberStarts,
  type GroupResizeMemberStart,
  type GroupResizePreviewUpdate,
} from '../edit-mode/manual-edit-group-resize';
import { hostDeltaToContentDelta, freezeGestureHostGeom } from '../edit-mode/preview-coords';
import { resolveManualEditChromeHostRect } from '../edit-mode/move-math';
import {
  shouldOmitComposedMembersFromTipRemountPartialUnion,
  shouldLatchTipRemountPartialUnionMinSize,
  resolveTipRemountPartialUnionWithMinSizeLatch,
} from '../edit-mode/manual-edit-freeze';
import {
  RESIZE_HANDLES,
  cursorForResizeHandle,
  resizeHandleFromHostPoint,
  type ResizeHandle,
} from '../edit-mode/resize-math';
import {
  snapMoveDelta,
  unionManualEditRectsList,
  type SnapGuide,
  type SnapSource,
} from '../edit-mode/manual-edit-geometry-snap';
import type { ManualEditRect, ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import { ManualEditSnapGuides } from './ManualEditSnapGuides';
import styles from './ManualEditResizeOverlay.module.css';

export type { GroupMovePreviewUpdate, GroupResizePreviewUpdate };

export type ManualEditMultiSelectOverlayProps = {
  targets: ManualEditTarget[];
  previewScale: number;
  hostOffset: { x: number; y: number };
  measureHostRect: (id: string) => ManualEditRect | null;
  movable?: boolean;
  resizable?: boolean;
  disabled?: boolean;
  /**
   * Tip remount: keep measured/last-good paint even when stale vs composed
   * (526).
   */
  trustHostPaintDespiteStale?: boolean;
  /**
   * Tip remount session only (not paint-sync hold) — omit composed-only
   * members from partial-paint union (529/532).
   */
  stabilizePartialPaintUnion?: boolean;
  /** Tip remount: track pointer over chrome so late geometry apply can defer (516). */
  onChromePointerHoverChange?: (hovering: boolean) => void;
  draftMemberRects?: Record<string, ManualEditRect> | null;
  onGroupMovePreview?: (updates: GroupMovePreviewUpdate[]) => void;
  onGroupMoveCommit?: (
    updates: GroupMovePreviewUpdate[],
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
  ) => void | Promise<void>;
  onGroupMoveCancel?: (
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
    memberStarts: GroupMoveMemberStart[],
  ) => void;
  onGroupResizePreview?: (updates: GroupResizePreviewUpdate[]) => void;
  onGroupResizeCommit?: (
    updates: GroupResizePreviewUpdate[],
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
    handle: ResizeHandle,
    dx: number,
    dy: number,
    shiftKey: boolean,
  ) => void | Promise<void>;
  onGroupResizeCancel?: (
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
    memberStarts: GroupResizeMemberStart[],
  ) => void;
  onGestureSessionChange?: (active: boolean) => void;
  snapSources?: readonly SnapSource[];
  snapEnabled?: boolean;
};

type MoveDragState = {
  kind: 'move';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  unionStart: ManualEditRect;
  members: GroupMoveMemberStart[];
  stylesBefore: Record<string, Partial<ManualEditStyles>>;
  hostScale: number;
  hostOffset: { x: number; y: number };
  moved: boolean;
  previewed: boolean;
  lastUpdates: GroupMovePreviewUpdate[];
  lastGuides: SnapGuide[];
  sealed: boolean;
};

type ResizeDragState = {
  kind: 'resize';
  pointerId: number;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  unionStart: ManualEditRect;
  members: GroupResizeMemberStart[];
  stylesBefore: Record<string, Partial<ManualEditStyles>>;
  hostScale: number;
  hostOffset: { x: number; y: number };
  moved: boolean;
  previewed: boolean;
  lastDx: number;
  lastDy: number;
  lastShiftKey: boolean;
  lastUpdates: GroupResizePreviewUpdate[];
  sealed: boolean;
};

type MultiSelectDragState = MoveDragState | ResizeDragState;

function memberContentRect(
  target: ManualEditTarget,
  draftRect?: ManualEditRect | null,
): ManualEditRect {
  if (!draftRect) return target.rect;
  return draftRect;
}

function unionHostRect(
  targets: ManualEditTarget[],
  composeScale: number,
  composeOffset: { x: number; y: number },
  measureHostRect: (id: string) => ManualEditRect | null,
  draftMemberRects?: Record<string, ManualEditRect> | null,
  preferComposed = false,
  trustHostPaintDespiteStale = false,
  stabilizePartialPaintUnion = false,
  previousUnion: ManualEditRect | null = null,
): ManualEditRect | null {
  const members = targets.map((target) => {
    const contentRect = memberContentRect(target, draftMemberRects?.[target.id] ?? null);
    const paint = preferComposed ? null : measureHostRect(target.id);
    const paintOk = Boolean(paint && paint.width >= 1 && paint.height >= 1);
    return { target, contentRect, paint, paintOk };
  });
  const paintBearingCount = members.filter((m) => m.paintOk).length;
  const omitComposed = shouldOmitComposedMembersFromTipRemountPartialUnion(
    stabilizePartialPaintUnion,
    targets.length,
    paintBearingCount,
  );
  let union: ManualEditRect | null = null;
  for (const member of members) {
    if (omitComposed && !member.paintOk) continue;
    const hostRect = resolveManualEditChromeHostRect(
      member.contentRect,
      composeScale,
      composeOffset,
      member.paint,
      trustHostPaintDespiteStale,
    );
    if (!union) {
      union = { ...hostRect };
      continue;
    }
    const right = Math.max(union.x + union.width, hostRect.x + hostRect.width);
    const bottom = Math.max(union.y + union.height, hostRect.y + hostRect.height);
    union = {
      x: Math.min(union.x, hostRect.x),
      y: Math.min(union.y, hostRect.y),
      width: right - Math.min(union.x, hostRect.x),
      height: bottom - Math.min(union.y, hostRect.y),
    };
  }
  if (
    union
    && previousUnion
    && shouldLatchTipRemountPartialUnionMinSize(
      omitComposed,
      previousUnion.width >= 1 && previousUnion.height >= 1,
      union.width >= 1 && union.height >= 1,
    )
  ) {
    return resolveTipRemountPartialUnionWithMinSizeLatch(previousUnion, union);
  }
  return union;
}

function resolveGestureHostScale(
  targets: ManualEditTarget[],
  previewScale: number,
  hostOffset: { x: number; y: number },
  measureHostRect: (id: string) => ManualEditRect | null,
): number {
  const primary = targets[targets.length - 1] ?? targets[0];
  if (!primary) return previewScale;
  const layoutWidth = primary.layoutWidth && primary.layoutWidth >= 1
    ? primary.layoutWidth
    : primary.rect.width;
  const layoutHeight = primary.layoutHeight && primary.layoutHeight >= 1
    ? primary.layoutHeight
    : primary.rect.height;
  const paint = measureHostRect(primary.id);
  const { hostScale } = freezeGestureHostGeom(
    {
      x: primary.rect.x,
      y: primary.rect.y,
      width: layoutWidth,
      height: layoutHeight,
    },
    paint,
    previewScale,
    hostOffset,
  );
  return hostScale;
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

export function ManualEditMultiSelectOverlay({
  targets,
  previewScale,
  hostOffset,
  measureHostRect,
  movable = false,
  resizable = false,
  disabled = false,
  trustHostPaintDespiteStale = false,
  stabilizePartialPaintUnion = false,
  onChromePointerHoverChange,
  draftMemberRects = null,
  onGroupMovePreview,
  onGroupMoveCommit,
  onGroupMoveCancel,
  onGroupResizePreview,
  onGroupResizeCommit,
  onGroupResizeCancel,
  onGestureSessionChange,
  snapSources = [],
  snapEnabled = true,
}: ManualEditMultiSelectOverlayProps) {
  const dragRef = useRef<MultiSelectDragState | null>(null);
  /** Previous tip remount union — min-size latch while partial paint omit (532). */
  const tipRemountPartialUnionLatchRef = useRef<ManualEditRect | null>(null);
  const [gesturing, setGesturing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [gestureSnapScale, setGestureSnapScale] = useState<number | null>(null);
  const [gestureSnapOffset, setGestureSnapOffset] = useState<{ x: number; y: number } | null>(null);
  const onGroupMovePreviewRef = useRef(onGroupMovePreview);
  onGroupMovePreviewRef.current = onGroupMovePreview;
  const onGroupMoveCommitRef = useRef(onGroupMoveCommit);
  onGroupMoveCommitRef.current = onGroupMoveCommit;
  const onGroupMoveCancelRef = useRef(onGroupMoveCancel);
  onGroupMoveCancelRef.current = onGroupMoveCancel;
  const onGroupResizePreviewRef = useRef(onGroupResizePreview);
  onGroupResizePreviewRef.current = onGroupResizePreview;
  const onGroupResizeCommitRef = useRef(onGroupResizeCommit);
  onGroupResizeCommitRef.current = onGroupResizeCommit;
  const onGroupResizeCancelRef = useRef(onGroupResizeCancel);
  onGroupResizeCancelRef.current = onGroupResizeCancel;
  const onGestureSessionChangeRef = useRef(onGestureSessionChange);
  onGestureSessionChangeRef.current = onGestureSessionChange;
  const snapSourcesRef = useRef(snapSources);
  snapSourcesRef.current = snapSources;
  const snapEnabledRef = useRef(snapEnabled);
  snapEnabledRef.current = snapEnabled;
  const targetsByIdRef = useRef(new Map<string, ManualEditTarget>());
  targetsByIdRef.current = new Map(targets.map((target) => [target.id, target]));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      const previewed = drag.previewed;
      const stylesBefore = drag.stylesBefore;
      dragRef.current = null;
      setGesturing(false);
      setMoving(false);
      setResizing(false);
      setSnapGuides([]);
      setGestureSnapScale(null);
      setGestureSnapOffset(null);
      onGestureSessionChangeRef.current?.(false);
      if (!previewed) return;
      if (drag.kind === 'move') {
        onGroupMoveCancelRef.current?.(stylesBefore, drag.members);
      } else {
        onGroupResizeCancelRef.current?.(stylesBefore, drag.members);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    const endDrag = (event: PointerEvent, commit: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.sealed || event.pointerId !== drag.pointerId) return;
      const previewed = drag.previewed;
      const moved = drag.moved;
      drag.sealed = true;
      const finish = () => {
        if (dragRef.current === drag) dragRef.current = null;
        onGestureSessionChangeRef.current?.(false);
        setGesturing(false);
        setMoving(false);
        setResizing(false);
        setSnapGuides([]);
        setGestureSnapScale(null);
        setGestureSnapOffset(null);
      };
      void (async () => {
        try {
          if (drag.kind === 'move') {
            if (commit && moved && drag.lastUpdates.length > 0) {
              await Promise.resolve(
                onGroupMoveCommitRef.current?.(drag.lastUpdates, drag.stylesBefore),
              );
            } else if (previewed) {
              onGroupMoveCancelRef.current?.(drag.stylesBefore, drag.members);
            }
          } else if (commit && moved && drag.lastUpdates.length > 0) {
            await Promise.resolve(
              onGroupResizeCommitRef.current?.(
                drag.lastUpdates,
                drag.stylesBefore,
                drag.handle,
                drag.lastDx,
                drag.lastDy,
                drag.lastShiftKey,
              ),
            );
          } else if (previewed) {
            onGroupResizeCancelRef.current?.(drag.stylesBefore, drag.members);
          }
        } finally {
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
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (drag.kind === 'move') {
        let guides: SnapGuide[] = [];
        if (snapEnabledRef.current && snapSourcesRef.current.length > 0) {
          const snapped = snapMoveDelta(drag.unionStart, dx, dy, snapSourcesRef.current);
          dx = snapped.dx;
          dy = snapped.dy;
          guides = snapped.guides;
        }
        drag.moved = groupMoveDeltaMoved(drag.members, dx, dy, false);
        if (!drag.moved) {
          setSnapGuides([]);
          return;
        }
        const updates = computeGroupMovePreviewUpdates(
          drag.members,
          targetsByIdRef.current,
          dx,
          dy,
          false,
        );
        drag.lastUpdates = updates;
        drag.lastGuides = guides;
        drag.previewed = true;
        setSnapGuides(guides);
        onGroupMovePreviewRef.current?.(updates);
        return;
      }
      drag.moved = groupResizeDeltaMoved(
        drag.unionStart,
        drag.handle,
        dx,
        dy,
        event.shiftKey,
      );
      if (!drag.moved) return;
      const updates = computeGroupResizePreviewUpdates(
        drag.unionStart,
        drag.members,
        drag.handle,
        dx,
        dy,
        event.shiftKey,
      );
      drag.lastUpdates = updates;
      drag.lastDx = dx;
      drag.lastDy = dy;
      drag.lastShiftKey = event.shiftKey;
      drag.previewed = true;
      onGroupResizePreviewRef.current?.(updates);
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
      if (dragRef.current) {
        dragRef.current = null;
        setSnapGuides([]);
        setGestureSnapScale(null);
        setGestureSnapOffset(null);
        onGestureSessionChangeRef.current?.(false);
      }
    };
  }, []);

  if (targets.length < 2) return null;
  const gestureComposed = Boolean(
    draftMemberRects && Object.keys(draftMemberRects).length > 0,
  );
  const composeScale = gestureSnapScale ?? previewScale;
  const composeOffset = gestureSnapOffset ?? hostOffset;
  if (!stabilizePartialPaintUnion) {
    tipRemountPartialUnionLatchRef.current = null;
  }
  const hostRect = unionHostRect(
    targets,
    composeScale,
    composeOffset,
    measureHostRect,
    draftMemberRects,
    gestureComposed,
    trustHostPaintDespiteStale,
    stabilizePartialPaintUnion,
    tipRemountPartialUnionLatchRef.current,
  );
  if (hostRect && hostRect.width >= 1 && hostRect.height >= 1) {
    tipRemountPartialUnionLatchRef.current = { ...hostRect };
  }
  if (!hostRect || hostRect.width < 1 || hostRect.height < 1) return null;

  const interactive = (movable || resizable) && !disabled;

  const overlayStyle: CSSProperties = {
    left: hostRect.x,
    top: hostRect.y,
    width: hostRect.width,
    height: hostRect.height,
  };

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!movable || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const members = buildGroupMoveMemberStarts(targets);
    const unionStart = unionManualEditRectsList(members.map((member) => member.startRect));
    if (!unionStart) return;
    const stylesBefore = groupMoveStylesBefore(targets);
    const hostScale = resolveGestureHostScale(targets, previewScale, hostOffset, measureHostRect);
    dragRef.current = {
      kind: 'move',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      unionStart,
      members,
      stylesBefore,
      hostScale,
      hostOffset: { ...hostOffset },
      moved: false,
      previewed: false,
      lastUpdates: [],
      lastGuides: [],
      sealed: false,
    };
    setGesturing(true);
    setMoving(true);
    setGestureSnapScale(hostScale);
    setGestureSnapOffset({ ...hostOffset });
    onGestureSessionChangeRef.current?.(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom / older engines may lack pointer capture
    }
  };

  const beginResize = (handle: ResizeHandle, event: ReactPointerEvent<Element>) => {
    if (!resizable || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const members = buildGroupResizeMemberStarts(targets);
    const unionStart = unionRectFromMemberStarts(members);
    if (!unionStart) return;
    const stylesBefore = groupResizeStylesBefore(targets);
    const hostScale = resolveGestureHostScale(targets, previewScale, hostOffset, measureHostRect);
    dragRef.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      unionStart,
      members,
      stylesBefore,
      hostScale,
      hostOffset: { ...hostOffset },
      moved: false,
      previewed: false,
      lastDx: 0,
      lastDy: 0,
      lastShiftKey: false,
      lastUpdates: [],
      sealed: false,
    };
    setGesturing(true);
    setResizing(true);
    setSnapGuides([]);
    setGestureSnapScale(hostScale);
    setGestureSnapOffset({ ...hostOffset });
    onGestureSessionChangeRef.current?.(true);
    try {
      (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom / older engines may lack pointer capture
    }
  };

  const onOverlayPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || dragRef.current) return;
    if ((event.target as HTMLElement | null)?.closest?.('[data-handle]')) return;
    const box = event.currentTarget.getBoundingClientRect();
    const edge = resizeHandleFromHostPoint(
      event.clientX - box.left,
      event.clientY - box.top,
      box.width,
      box.height,
    );
    if (edge && resizable) {
      beginResize(edge, event);
      return;
    }
    if (movable) beginMove(event);
  };

  const onOverlayPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || dragRef.current || gesturing) return;
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
      previewScale={gestureSnapScale ?? previewScale}
      hostOffset={gestureSnapOffset ?? hostOffset}
    />
    <div
      className={[
        styles.overlay,
        interactive ? styles.interactive : '',
        movable ? styles.movable : '',
        moving ? styles.moving : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="manual-edit-multi-select-overlay"
      data-multi-count={targets.length}
      data-moving={moving ? 'true' : 'false'}
      data-resizing={resizing ? 'true' : 'false'}
      data-movable={movable ? 'true' : 'false'}
      data-resizable={resizable ? 'true' : 'false'}
      style={{
        ...overlayStyle,
        borderStyle: 'dashed',
        pointerEvents: interactive ? undefined : 'none',
        background: 'transparent',
      }}
      onPointerEnter={onChromePointerHoverChange
        ? () => onChromePointerHoverChange(true)
        : undefined}
      onPointerLeave={onChromePointerHoverChange
        ? () => onChromePointerHoverChange(false)
        : undefined}
      onPointerDown={interactive ? onOverlayPointerDown : undefined}
      onPointerMove={interactive ? onOverlayPointerMove : undefined}
    >
      {resizable ? RESIZE_HANDLES.map((handle) => (
        <button
          key={handle}
          type="button"
          className={styles.handle}
          data-testid={`manual-edit-multi-resize-handle-${handle}`}
          data-handle={handle}
          aria-label={`Resize ${handle}`}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          style={{
            ...handlePositionStyle(handle),
            cursor: disabled ? 'default' : cursorForResizeHandle(handle),
          }}
          onPointerDownCapture={(event) => beginResize(handle, event)}
        />
      )) : null}
    </div>
    </>
  );
}
