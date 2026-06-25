export type WorkspaceMenuLayout = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

type TriggerRect = Pick<DOMRect, "left" | "right" | "bottom" | "top" | "width">;

type Viewport = {
  width: number;
  height: number;
};

type LayoutOptions = {
  margin?: number;
  gap?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
};

/** Viewport-anchored menu placement for the embed workspace switcher. */
export function computeWorkspaceMenuLayout(
  triggerRect: TriggerRect,
  viewport: Viewport,
  options: LayoutOptions = {},
): WorkspaceMenuLayout {
  const margin = options.margin ?? 12;
  const gap = options.gap ?? 7;
  const minWidth = options.minWidth ?? 240;
  const minHeight = options.minHeight ?? 200;
  const maxWidth = options.maxWidth ?? Math.min(320, viewport.width - margin * 2);
  const width = Math.min(Math.max(minWidth, triggerRect.width), Math.max(minWidth, maxWidth));
  const left = Math.max(
    margin,
    Math.min(triggerRect.left, viewport.width - width - margin),
  );

  const spaceBelow = viewport.height - triggerRect.bottom - gap - margin;
  const spaceAbove = triggerRect.top - gap - margin;
  const openUpward = spaceBelow < minHeight && spaceAbove > spaceBelow;

  if (openUpward) {
    return {
      bottom: viewport.height - triggerRect.top + gap,
      left,
      width,
      maxHeight: Math.max(160, spaceAbove),
    };
  }

  return {
    top: triggerRect.bottom + gap,
    left,
    width,
    maxHeight: Math.max(160, spaceBelow),
  };
}
