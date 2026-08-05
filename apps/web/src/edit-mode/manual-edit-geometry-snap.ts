import type { ManualEditRect, ManualEditTarget } from './types';

/** Pointer proximity (content px) to snap an edge or center while dragging. */
export const MANUAL_EDIT_SNAP_THRESHOLD_PX = 5;

export type SnapGuide = {
  orientation: 'vertical' | 'horizontal';
  /** Fixed content-space coordinate (x for vertical, y for horizontal). */
  position: number;
  /** Span along the perpendicular axis in content space. */
  spanStart: number;
  spanEnd: number;
};

export type SnapSource = {
  rect: ManualEditRect;
  kind: 'element' | 'page';
};

export function rectSnapMetrics(rect: ManualEditRect): {
  left: number;
  centerX: number;
  right: number;
  top: number;
  centerY: number;
  bottom: number;
} {
  return {
    left: rect.x,
    centerX: rect.x + rect.width / 2,
    right: rect.x + rect.width,
    top: rect.y,
    centerY: rect.y + rect.height / 2,
    bottom: rect.y + rect.height,
  };
}

export function unionManualEditRects(
  a: ManualEditRect,
  b: ManualEditRect,
): ManualEditRect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function unionManualEditRectsList(
  rects: readonly ManualEditRect[],
): ManualEditRect | null {
  if (rects.length === 0) return null;
  let union = { ...rects[0]! };
  for (let i = 1; i < rects.length; i += 1) {
    union = unionManualEditRects(union, rects[i]!);
  }
  return union;
}

export function translateManualEditRect(
  rect: ManualEditRect,
  dx: number,
  dy: number,
): ManualEditRect {
  return {
    ...rect,
    x: rect.x + dx,
    y: rect.y + dy,
  };
}

export function collectSnapSources(
  targets: readonly ManualEditTarget[],
  excludeIds: ReadonlySet<string>,
  pageBounds?: ManualEditRect | null,
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): SnapSource[] {
  const out: SnapSource[] = [];
  const excludedAncestors = isDescendant
    ? Array.from(excludeIds)
    : [];
  for (const target of targets) {
    if (excludeIds.has(target.id) || target.isHidden) continue;
    if (
      isDescendant
      && excludedAncestors.some((ancestorId) => isDescendant(target.id, ancestorId))
    ) {
      continue;
    }
    if (target.rect.width < 1 || target.rect.height < 1) continue;
    out.push({ rect: target.rect, kind: 'element' });
  }
  if (
    pageBounds
    && pageBounds.width >= 1
    && pageBounds.height >= 1
  ) {
    out.push({ rect: pageBounds, kind: 'page' });
  }
  return out;
}

type Axis = 'x' | 'y';

type AxisEdge = {
  value: number;
};

function axisEdges(rect: ManualEditRect, axis: Axis): AxisEdge[] {
  const metrics = rectSnapMetrics(rect);
  if (axis === 'x') {
    return [
      { value: metrics.left },
      { value: metrics.centerX },
      { value: metrics.right },
    ];
  }
  return [
    { value: metrics.top },
    { value: metrics.centerY },
    { value: metrics.bottom },
  ];
}

function guideSpanForRects(
  a: ManualEditRect,
  b: ManualEditRect,
  axis: Axis,
  pageBounds?: ManualEditRect | null,
): { spanStart: number; spanEnd: number } {
  const combined = unionManualEditRects(a, b);
  if (pageBounds && pageBounds.width >= 1 && pageBounds.height >= 1) {
    if (axis === 'x') {
      return { spanStart: pageBounds.y, spanEnd: pageBounds.y + pageBounds.height };
    }
    return { spanStart: pageBounds.x, spanEnd: pageBounds.x + pageBounds.width };
  }
  if (axis === 'x') {
    return { spanStart: combined.y, spanEnd: combined.y + combined.height };
  }
  return { spanStart: combined.x, spanEnd: combined.x + combined.width };
}

function snapAxisDelta(
  startRect: ManualEditRect,
  delta: number,
  axis: Axis,
  sources: readonly SnapSource[],
  thresholdPx: number,
  pageBounds?: ManualEditRect | null,
): { delta: number; guide: SnapGuide | null } {
  const draft = axis === 'x'
    ? translateManualEditRect(startRect, delta, 0)
    : translateManualEditRect(startRect, 0, delta);
  const movingEdges = axisEdges(draft, axis);

  let bestDistance = thresholdPx + 1;
  let bestCorrection = 0;
  let bestGuide: SnapGuide | null = null;

  for (const movingEdge of movingEdges) {
    for (const source of sources) {
      for (const targetEdge of axisEdges(source.rect, axis)) {
        const distance = Math.abs(movingEdge.value - targetEdge.value);
        if (distance > thresholdPx || distance >= bestDistance) continue;
        const correction = targetEdge.value - movingEdge.value;
        const span = guideSpanForRects(
          draft,
          source.rect,
          axis,
          source.kind === 'page' ? source.rect : pageBounds,
        );
        bestDistance = distance;
        bestCorrection = correction;
        bestGuide = axis === 'x'
          ? {
            orientation: 'vertical',
            position: targetEdge.value,
            spanStart: span.spanStart,
            spanEnd: span.spanEnd,
          }
          : {
            orientation: 'horizontal',
            position: targetEdge.value,
            spanStart: span.spanStart,
            spanEnd: span.spanEnd,
          };
      }
    }
  }

  return {
    delta: delta + bestCorrection,
    guide: bestGuide,
  };
}

/**
 * Snap a translated box to sibling/page edges while dragging.
 * Shift-axis lock should be applied to dx/dy before calling this helper.
 */
export function snapMoveDelta(
  startRect: ManualEditRect,
  dx: number,
  dy: number,
  sources: readonly SnapSource[],
  options?: { thresholdPx?: number; pageBounds?: ManualEditRect | null },
): { dx: number; dy: number; guides: SnapGuide[] } {
  const thresholdPx = options?.thresholdPx ?? MANUAL_EDIT_SNAP_THRESHOLD_PX;
  const pageBounds = options?.pageBounds
    ?? sources.find((source) => source.kind === 'page')?.rect
    ?? null;
  if (sources.length === 0) {
    return { dx, dy, guides: [] };
  }

  const snappedX = snapAxisDelta(startRect, dx, 'x', sources, thresholdPx, pageBounds);
  const snappedY = snapAxisDelta(
    translateManualEditRect(startRect, snappedX.delta, 0),
    dy,
    'y',
    sources,
    thresholdPx,
    pageBounds,
  );
  const guides = [snappedX.guide, snappedY.guide].filter(
    (guide): guide is SnapGuide => guide != null,
  );
  return {
    dx: snappedX.delta,
    dy: snappedY.delta,
    guides,
  };
}

export function snapGuideToHostSegment(
  guide: SnapGuide,
  previewScale: number,
  hostOffset: { x: number; y: number },
): { x1: number; y1: number; x2: number; y2: number } {
  const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
  if (guide.orientation === 'vertical') {
    const x = hostOffset.x + guide.position * scale;
    return {
      x1: x,
      y1: hostOffset.y + guide.spanStart * scale,
      x2: x,
      y2: hostOffset.y + guide.spanEnd * scale,
    };
  }
  const y = hostOffset.y + guide.position * scale;
  return {
    x1: hostOffset.x + guide.spanStart * scale,
    y1: y,
    x2: hostOffset.x + guide.spanEnd * scale,
    y2: y,
  };
}
