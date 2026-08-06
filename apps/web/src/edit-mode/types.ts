export type ManualEditKind = 'text' | 'link' | 'image' | 'container' | 'token';

export interface ManualEditRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualEditFields {
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
}

export interface ManualEditStyles {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  display: string;
  textAlign: string;
  textDecoration: string;
  /** Layout wrap control — prompted for "한 줄로/nowrap" comment edits. */
  whiteSpace: string;
  lineHeight: string;
  letterSpacing: string;
  width: string;
  height: string;
  minHeight: string;
  /** Cleared to `none` on drag-resize so stylesheet `max-width:100%` cannot clamp the box. */
  maxWidth: string;
  maxHeight: string;
  /** Inline CSS position; used when promoting flow boxes to absolute (53). */
  position: string;
  /** Used by drag-resize / position-move for absolute/fixed elements. */
  left: string;
  top: string;
  /** Cleared on move commit so left+right / top+bottom do not fight. */
  right: string;
  bottom: string;
  gap: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  backgroundColor: string;
  opacity: string;
  padding: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  margin: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  border: string;
  borderTopWidth: string;
  borderRightWidth: string;
  borderBottomWidth: string;
  borderLeftWidth: string;
  borderStyle: string;
  borderColor: string;
  borderRadius: string;
  /** Stacking among positioned siblings (absolute/fixed). */
  zIndex: string;
}

export interface ManualEditTarget {
  id: string;
  kind: ManualEditKind;
  label: string;
  tagName: string;
  className: string;
  text: string;
  /**
   * Visual border-box in iframe viewport coordinates (`getBoundingClientRect`).
   * Includes ancestor CSS transforms (deck-stage fit scale). Overlay chrome
   * must track this; CSS width/height writes must NOT — use layoutWidth/Height.
   */
  rect: ManualEditRect;
  /**
   * Layout border-box (`offsetWidth` / `offsetHeight`) — the space CSS
   * `width`/`height` px values are authored in. Under deck `transform: scale`
   * this is larger than `rect` when fit-scale < 1.
   */
  layoutWidth?: number;
  layoutHeight?: number;
  fields: ManualEditFields;
  attributes: Record<string, string>;
  styles: ManualEditStyles;
  isLayoutContainer: boolean;
  isHidden?: boolean;
  /** Computed CSS position (`static` / `absolute` / …) for resize anchoring. */
  cssPosition?: string;
  /** offsetParent-relative left/top for promote-on-drag (53). */
  offsetLeft?: number;
  offsetTop?: number;
  /**
   * When sticky→absolute promote needs a static scrollport as CB, bridge
   * reports that ancestor's stable id so the host persists `position:relative`
   * before the promote set-style (53 Loop15).
   */
  stickyScrollportId?: string;
  /** Deck slide index from nearest `data-slide-index` ancestor. */
  slideIndex?: number;
  /** Parent stable id for layer paint-order sorting. */
  parentKey?: string;
  /** Parent's index among its parent's element children. */
  parentSiblingIndex?: number;
  /** Parent effective z-index when positioned. */
  parentStackZ?: number;
  /** Effective z-index when positioned (absolute/fixed). */
  stackZ?: number;
  /** Index among parent's element children. */
  siblingIndex?: number;
  outerHtml: string;
}

export type ManualEditPatch =
  | { id: string; kind: 'set-text'; value: string; flattenNestedMarkup?: boolean }
  | { id: string; kind: 'set-link'; text: string; href: string }
  | { id: string; kind: 'set-image'; src: string; alt: string }
  | { id: string; kind: 'remove-element' }
  | { kind: 'set-token'; token: string; value: string }
  | { id: string; kind: 'set-style'; styles: Partial<ManualEditStyles> }
  | { id: string; kind: 'set-attributes'; attributes: Record<string, string> }
  | { id: string; kind: 'set-outer-html'; html: string }
  | { kind: 'set-full-source'; source: string };

export interface ManualEditHistoryEntry {
  id: string;
  label: string;
  patch: ManualEditPatch;
  beforeSource: string;
  afterSource: string;
  createdAt: number;
}

export interface ManualEditTargetMessage {
  type: 'od-edit-targets';
  targets: ManualEditTarget[];
}

export interface ManualEditSelectMessage {
  type: 'od-edit-select';
  target: ManualEditTarget;
  /** Shift / meta / ctrl — toggle membership in the current selection set. */
  additive?: boolean;
}

export interface ManualEditHoverMessage {
  type: 'od-edit-hover';
  target: ManualEditTarget;
}

export interface ManualEditBackgroundMessage {
  type: 'od-edit-background';
}

export interface ManualEditPreviewAppliedMessage {
  type: 'od-edit-preview-style-applied';
  id: string;
  version: number;
  ok: boolean;
  error?: string;
}

export interface ManualEditTextCommitMessage {
  type: 'od-edit-text-commit';
  id: string;
  value: string;
  /** Inline contenteditable edits intentionally flatten nested markup. */
  flattenNestedMarkup?: boolean;
}

export interface ManualEditTextActiveMessage {
  type: 'od-edit-text-active';
  active: boolean;
}

export interface ManualEditRectMessage {
  type: 'od-edit-rect';
  id: string;
  ok: boolean;
  target?: ManualEditTarget;
  error?: string;
}

export type ManualEditBridgeMessage =
  | ManualEditTargetMessage
  | ManualEditSelectMessage
  | ManualEditHoverMessage
  | ManualEditBackgroundMessage
  | ManualEditPreviewAppliedMessage
  | ManualEditTextCommitMessage
  | ManualEditTextActiveMessage
  | ManualEditRectMessage;

export const MANUAL_EDIT_STYLE_PROPS: readonly (keyof ManualEditStyles)[] = [
  'fontFamily', 'fontSize', 'fontWeight', 'color', 'display', 'textAlign', 'textDecoration', 'whiteSpace', 'lineHeight', 'letterSpacing',
  'width', 'height', 'minHeight', 'maxWidth', 'maxHeight', 'position', 'left', 'top', 'right', 'bottom',
  'gap', 'flexDirection', 'justifyContent', 'alignItems',
  'backgroundColor', 'opacity',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'border', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderStyle', 'borderColor', 'borderRadius', 'zIndex',
];

export function emptyManualEditStyles(): ManualEditStyles {
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    acc[key] = '';
    return acc;
  }, {} as ManualEditStyles);
}
