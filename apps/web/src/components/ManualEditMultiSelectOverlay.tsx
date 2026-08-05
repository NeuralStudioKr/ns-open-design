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
import { hostDeltaToContentDelta } from '../edit-mode/preview-coords';
import { resolveManualEditChromeHostRect } from '../edit-mode/move-math';
import type { ManualEditRect, ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import styles from './ManualEditResizeOverlay.module.css';

export type { GroupMovePreviewUpdate };

export type ManualEditMultiSelectOverlayProps = {
  targets: ManualEditTarget[];
  previewScale: number;
  hostOffset: { x: number; y: number };
  measureHostRect: (id: string) => ManualEditRect | null;
  movable?: boolean;
  disabled?: boolean;
  draftViewports?: Record<string, { x: number; y: number }> | null;
  onGroupMovePreview?: (updates: GroupMovePreviewUpdate[]) => void;
  onGroupMoveCommit?: (
    updates: GroupMovePreviewUpdate[],
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
  ) => void | Promise<void>;
  onGroupMoveCancel?: (
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
    memberStarts: GroupMoveMemberStart[],
  ) => void;
  onGestureSessionChange?: (active: boolean) => void;
};

type GroupDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  members: GroupMoveMemberStart[];
  stylesBefore: Record<string, Partial<ManualEditStyles>>;
  hostScale: number;
  moved: boolean;
  previewed: boolean;
  lastUpdates: GroupMovePreviewUpdate[];
  sealed: boolean;
};

function memberContentRect(
  target: ManualEditTarget,
  draftViewport?: { x: number; y: number } | null,
): ManualEditRect {
  if (!draftViewport) return target.rect;
  return {
    ...target.rect,
    x: draftViewport.x,
    y: draftViewport.y,
  };
}

function unionHostRect(
  targets: ManualEditTarget[],
  previewScale: number,
  hostOffset: { x: number; y: number },
  measureHostRect: (id: string) => ManualEditRect | null,
  draftViewports?: Record<string, { x: number; y: number }> | null,
): ManualEditRect | null {
  let union: ManualEditRect | null = null;
  for (const target of targets) {
    const contentRect = memberContentRect(target, draftViewports?.[target.id] ?? null);
    const paint = measureHostRect(target.id);
    const hostRect = resolveManualEditChromeHostRect(
      contentRect,
      previewScale,
      hostOffset,
      paint,
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
  return union;
}

export function ManualEditMultiSelectOverlay({
  targets,
  previewScale,
  hostOffset,
  measureHostRect,
  movable = false,
  disabled = false,
  draftViewports = null,
  onGroupMovePreview,
  onGroupMoveCommit,
  onGroupMoveCancel,
  onGestureSessionChange,
}: ManualEditMultiSelectOverlayProps) {
  const dragRef = useRef<GroupDragState | null>(null);
  const [moving, setMoving] = useState(false);
  const onGroupMovePreviewRef = useRef(onGroupMovePreview);
  onGroupMovePreviewRef.current = onGroupMovePreview;
  const onGroupMoveCommitRef = useRef(onGroupMoveCommit);
  onGroupMoveCommitRef.current = onGroupMoveCommit;
  const onGroupMoveCancelRef = useRef(onGroupMoveCancel);
  onGroupMoveCancelRef.current = onGroupMoveCancel;
  const onGestureSessionChangeRef = useRef(onGestureSessionChange);
  onGestureSessionChangeRef.current = onGestureSessionChange;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      const before = drag.stylesBefore;
      const members = drag.members;
      const previewed = drag.previewed;
      dragRef.current = null;
      setMoving(false);
      onGestureSessionChangeRef.current?.(false);
      if (!previewed) return;
      onGroupMoveCancelRef.current?.(before, members);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    const endDrag = (event: PointerEvent, commit: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.sealed || event.pointerId !== drag.pointerId) return;
      const before = drag.stylesBefore;
      const previewed = drag.previewed;
      const moved = drag.moved;
      const updates = drag.lastUpdates;
      drag.sealed = true;
      const finish = () => {
        if (dragRef.current === drag) dragRef.current = null;
        onGestureSessionChangeRef.current?.(false);
        setMoving(false);
      };
      void (async () => {
        try {
          if (commit && moved && updates.length > 0) {
            await Promise.resolve(onGroupMoveCommitRef.current?.(updates, before));
          } else if (previewed) {
            onGroupMoveCancelRef.current?.(before, drag.members);
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
      const { dx, dy } = hostDeltaToContentDelta(hostDx, hostDy, drag.hostScale);
      drag.moved = groupMoveDeltaMoved(drag.members, dx, dy, event.shiftKey);
      if (!drag.moved) return;
      const updates = computeGroupMovePreviewUpdates(drag.members, dx, dy, event.shiftKey);
      drag.lastUpdates = updates;
      drag.previewed = true;
      onGroupMovePreviewRef.current?.(updates);
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
        onGestureSessionChangeRef.current?.(false);
      }
    };
  }, []);

  if (targets.length < 2) return null;
  const hostRect = unionHostRect(
    targets,
    previewScale,
    hostOffset,
    measureHostRect,
    draftViewports,
  );
  if (!hostRect || hostRect.width < 1 || hostRect.height < 1) return null;

  const interactive = movable && !disabled;

  const overlayStyle: CSSProperties = {
    left: hostRect.x,
    top: hostRect.y,
    width: hostRect.width,
    height: hostRect.height,
  };

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const members = buildGroupMoveMemberStarts(targets);
    const stylesBefore = groupMoveStylesBefore(targets);
    const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      members,
      stylesBefore,
      hostScale: scale,
      moved: false,
      previewed: false,
      lastUpdates: [],
      sealed: false,
    };
    setMoving(true);
    onGestureSessionChangeRef.current?.(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom / older engines may lack pointer capture
    }
  };

  return (
    <div
      className={[
        styles.overlay,
        interactive ? styles.interactive : '',
        interactive ? styles.movable : '',
        moving ? styles.moving : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="manual-edit-multi-select-overlay"
      data-multi-count={targets.length}
      data-moving={moving ? 'true' : 'false'}
      data-movable={interactive ? 'true' : 'false'}
      style={{
        ...overlayStyle,
        borderStyle: 'dashed',
        pointerEvents: interactive ? undefined : 'none',
        background: 'transparent',
      }}
      onPointerDown={interactive ? beginMove : undefined}
    />
  );
}
