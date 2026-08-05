import type { CSSProperties } from 'react';

import { resolveManualEditChromeHostRect } from '../edit-mode/move-math';
import type { ManualEditRect, ManualEditTarget } from '../edit-mode/types';
import styles from './ManualEditResizeOverlay.module.css';

export type ManualEditMultSelectOverlayProps = {
  targets: ManualEditTarget[];
  previewScale: number;
  hostOffset: { x: number; y: number };
  measureHostRect: (id: string) => ManualEditRect | null;
};

function unionHostRect(
  targets: ManualEditTarget[],
  previewScale: number,
  hostOffset: { x: number; y: number },
  measureHostRect: (id: string) => ManualEditRect | null,
): ManualEditRect | null {
  let union: ManualEditRect | null = null;
  for (const target of targets) {
    const paint = measureHostRect(target.id);
    const hostRect = resolveManualEditChromeHostRect(
      target.rect,
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

export function ManualEditMultSelectOverlay({
  targets,
  previewScale,
  hostOffset,
  measureHostRect,
}: ManualEditMultSelectOverlayProps) {
  if (targets.length < 2) return null;
  const hostRect = unionHostRect(targets, previewScale, hostOffset, measureHostRect);
  if (!hostRect || hostRect.width < 1 || hostRect.height < 1) return null;

  const overlayStyle: CSSProperties = {
    left: hostRect.x,
    top: hostRect.y,
    width: hostRect.width,
    height: hostRect.height,
  };

  return (
    <div
      className={styles.overlay}
      data-testid="manual-edit-mult-select-overlay"
      data-mult-count={targets.length}
      style={{
        ...overlayStyle,
        borderStyle: 'dashed',
        pointerEvents: 'none',
        background: 'transparent',
      }}
    />
  );
}
