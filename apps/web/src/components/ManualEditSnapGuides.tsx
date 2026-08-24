import type { SnapGuide } from '../edit-mode/manual-edit-geometry-snap';
import { snapGuideToHostSegment } from '../edit-mode/manual-edit-geometry-snap';
import styles from './ManualEditSnapGuides.module.css';

export type ManualEditSnapGuidesProps = {
  guides: readonly SnapGuide[];
  previewScale: number;
  hostOffset: { x: number; y: number };
};

export function ManualEditSnapGuides({
  guides,
  previewScale,
  hostOffset,
}: ManualEditSnapGuidesProps) {
  if (guides.length === 0) return null;
  return (
    <div
      className={styles.overlay}
      data-testid="manual-edit-snap-guides"
      aria-hidden
    >
      {guides.map((guide, index) => {
        const segment = snapGuideToHostSegment(guide, previewScale, hostOffset);
        const vertical = guide.orientation === 'vertical';
        const left = vertical ? segment.x1 : Math.min(segment.x1, segment.x2);
        const top = vertical ? Math.min(segment.y1, segment.y2) : segment.y1;
        const width = vertical ? 1 : Math.abs(segment.x2 - segment.x1);
        const height = vertical ? Math.abs(segment.y2 - segment.y1) : 1;
        return (
          <div
            key={`${guide.orientation}-${guide.position}-${index}`}
            className={`${styles.line} ${vertical ? styles.vertical : styles.horizontal}`}
            style={{ left, top, width, height }}
          />
        );
      })}
    </div>
  );
}
