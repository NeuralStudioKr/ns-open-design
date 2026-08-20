import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../i18n';
import { embedUiLabel } from '../teamver/embedUiLabels';
import { isAnchoredCssPosition } from '../edit-mode/resize-math';
import { canAdjustZOrderTarget, DISABLED_Z_ORDER_CAPABILITIES, type ZOrderAction, type ZOrderCapabilities } from '../edit-mode/manual-edit-z-order';
import { normalizeManualEditZIndexValue } from '../edit-mode/manual-edit-style-values';
import type { GroupAlignKind, GroupDistributeKind } from '../edit-mode/manual-edit-group-align';
import { ManualEditZOrderControls } from './ManualEditZOrderControls';
import { emptyManualEditStyles, type ManualEditHistoryEntry, type ManualEditPatch, type ManualEditStyles, type ManualEditTarget } from '../edit-mode/types';
import { Icon } from './Icon';

export interface ManualEditDraft {
  text: string;
  href: string;
  src: string;
  alt: string;
  styles: ManualEditStyles;
  attributesText: string;
  outerHtml: string;
  fullSource: string;
}

export function emptyManualEditDraft(source = ''): ManualEditDraft {
  return {
    text: '', href: '', src: '', alt: '',
    styles: emptyManualEditStyles(),
    attributesText: '{}', outerHtml: '', fullSource: source,
  };
}

export function ManualEditPanel({
  selectedTarget,
  selectedTargets = [],
  mixedStyleKeys,
  draft,
  error,
  canUndo,
  busy,
  onDraftChange,
  onStyleChange,
  onInvalidStyle,
  onError,
  onCancelDraft,
  onSaveDraft,
  onExit,
  onApplyPatch,
  onPickImage,
  pageStylesEnabled = true,
  floatingStyle,
  floatingClassName,
  onFloatingPositionChange,
  collapsed: collapsedProp,
  onCollapsedChange,
  groupAlignEnabled = false,
  groupDistributeEnabled = false,
  onGroupAlign,
  onGroupDistribute,
  zOrderCapabilities = null,
  onZOrder,
  zOrderBusy = false,
}: {
  targets: ManualEditTarget[];
  selectedTarget: ManualEditTarget | null;
  selectedTargets?: ManualEditTarget[];
  mixedStyleKeys?: ReadonlySet<keyof ManualEditStyles>;
  draft: ManualEditDraft;
  history: ManualEditHistoryEntry[];
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  busy?: boolean;
  pageStylesEnabled?: boolean;
  onSelectTarget: (target: ManualEditTarget, options?: { additive?: boolean }) => void;
  onDraftChange: (draft: ManualEditDraft) => void;
  onStyleChange?: (ids: string[], styles: Partial<ManualEditStyles>, label: string) => void;
  onInvalidStyle?: (id: string, keys: Array<keyof ManualEditStyles>) => void;
  onApplyPatch: (patch: ManualEditPatch, label: string) => void;
  onPickImage?: (file: File) => Promise<string | null>;
  floatingStyle?: CSSProperties;
  floatingClassName?: string;
  onFloatingPositionChange?: (position: { left: number; top: number }) => void;
  /** Host-controlled collapse so selection changes can keep a closed panel closed. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  groupAlignEnabled?: boolean;
  groupDistributeEnabled?: boolean;
  onGroupAlign?: (kind: GroupAlignKind) => void;
  onGroupDistribute?: (kind: GroupDistributeKind) => void;
  zOrderCapabilities?: ZOrderCapabilities | null;
  onZOrder?: (action: ZOrderAction) => void;
  zOrderBusy?: boolean;
  onError: (message: string) => void;
  onClearSelection: () => void;
  onExit?: () => void;
  onCancelDraft: () => void;
  onSaveDraft: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [collapsedState, setCollapsedState] = useState(false);
  const collapsed = collapsedProp ?? collapsedState;
  const setCollapsed = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(collapsed) : next;
    if (collapsedProp === undefined) setCollapsedState(resolved);
    onCollapsedChange?.(resolved);
  };
  const selectedTargetRef = useRef<ManualEditTarget | null>(selectedTarget);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetForInspector = selectedTarget;
  const multiCount = selectedTargets.length;
  const isMultiSelect = multiCount > 1;
  const mixedPlaceholder = t('manualEdit.mixedStyleValue');
  const panelTitle = isMultiSelect
    ? embedUiLabel(`${multiCount} selected`, `${multiCount}개 선택`)
    : targetForInspector
      ? readableManualEditTargetName(targetForInspector)
      : t('manualEdit.fallbackTitle');
  const inspectorFlags = resolveManualEditInspectorFlags(selectedTargets, targetForInspector);
  useEffect(() => {
    selectedTargetRef.current = selectedTarget;
  }, [selectedTarget]);
  // Keep collapse sticky across selection — only clear delete confirm.
  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedTarget?.id]);

  const changeTargetStyle = (key: keyof ManualEditStyles, value: string) => {
    const nextStyles = { ...draft.styles, [key]: value };
    onDraftChange({ ...draft, styles: nextStyles });
    if (!targetForInspector) return;
    const normalized = normalizeManualEditStyles({ [key]: value }, {
      layoutEnabled: inspectorFlags.layoutEnabled,
    });
    if (!normalized.ok) {
      onError('error' in normalized ? normalized.error : 'Invalid style value.');
      onInvalidStyle?.(targetForInspector.id, [key]);
      return;
    }
    onError('');
    const targetIds = isMultiSelect
      ? selectedTargets.map((item) => item.id)
      : [targetForInspector.id];
    const label = isMultiSelect
      ? embedUiLabel(`Style: ${multiCount} elements`, `스타일: ${multiCount}개 요소`)
      : `Style: ${targetForInspector.label}`;
    onStyleChange?.(targetIds, normalized.styles, label);
  };

  const startPanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onFloatingPositionChange) return;
    event.preventDefault();
    event.stopPropagation();
    const panel = event.currentTarget.closest('.manual-edit-right') as HTMLElement | null;
    const parent = panel?.parentElement;
    if (!panel || !parent) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = panel.offsetLeft;
    const startTop = panel.offsetTop;
    const parentRect = parent.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const pad = 8;
    const maxLeft = Math.max(pad, parentRect.width - panelRect.width - pad);
    const maxTop = Math.max(pad, parentRect.height - panelRect.height - pad);
    const ownerDocument = panel.ownerDocument;
    const move = (moveEvent: PointerEvent) => {
      onFloatingPositionChange({
        left: clamp(startLeft + moveEvent.clientX - startX, pad, maxLeft),
        top: clamp(startTop + moveEvent.clientY - startY, pad, maxTop),
      });
    };
    const up = () => {
      ownerDocument.removeEventListener('pointermove', move);
      ownerDocument.removeEventListener('pointerup', up);
      ownerDocument.removeEventListener('pointercancel', up);
    };
    ownerDocument.addEventListener('pointermove', move);
    ownerDocument.addEventListener('pointerup', up);
    ownerDocument.addEventListener('pointercancel', up);
  };

  const collapseLabel = collapsed ? t('manualEdit.expandPanel') : t('manualEdit.collapsePanel');
  return (
    <aside
      className={[
        'manual-edit-right',
        floatingStyle ? 'manual-edit-floating' : '',
        floatingClassName ?? '',
        collapsed ? 'manual-edit-collapsed' : '',
      ].filter(Boolean).join(' ')}
      style={floatingStyle}
    >
      <section className={`manual-edit-modal cc-panel${collapsed ? ' manual-edit-modal--collapsed' : ''}`}>
        <div className="manual-edit-titlebar">
          {floatingStyle ? (
            <button
              type="button"
              className="manual-edit-drag-handle"
              aria-label={t('manualEdit.movePanel')}
              title={t('manualEdit.movePanel')}
              onPointerDown={startPanelDrag}
            >
              <span aria-hidden />
            </button>
          ) : null}
          <span title={panelTitle}>{panelTitle}</span>
          <button
            type="button"
            className="manual-edit-titlebar-collapse"
            aria-label={collapseLabel}
            title={collapseLabel}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Icon name="chevron-down" size={16} />
          </button>
          {onExit ? (
            <button
              type="button"
              className="manual-edit-titlebar-close"
              aria-label={t('manualEdit.closePanel')}
              title={t('manualEdit.closePanel')}
              onClick={onExit}
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
        {collapsed ? null : (
          <>
            <div className="manual-edit-scroll">
              {isMultiSelect && !groupAlignEnabled ? (
                <section className="cc-section manual-edit-group-align">
                  <header className="cc-section-head">{t('manualEdit.align')}</header>
                  <div className="cc-section-body">
                    <p className="manual-edit-layer-empty">
                      {embedUiLabel(
                        'Group move needs 2+ absolute/fixed elements. Flow or nested selections cannot be dragged together.',
                        '그룹 이동은 absolute/fixed 요소 2개 이상에서만 가능합니다. flow 요소나 부모·자식 중복 선택은 함께 드래그할 수 없습니다.',
                      )}
                    </p>
                  </div>
                </section>
              ) : null}
              {isMultiSelect && groupAlignEnabled ? (
                <section className="cc-section manual-edit-group-align">
                  <header className="cc-section-head">{t('manualEdit.align')}</header>
                  <div className="cc-section-body manual-edit-group-align-grid">
                    <button type="button" className="cc-action-btn" onClick={() => onGroupAlign?.('left')}>
                      {embedUiLabel('Align left', '왼쪽 정렬')}
                    </button>
                    <button type="button" className="cc-action-btn" onClick={() => onGroupAlign?.('center')}>
                      {embedUiLabel('Align center', '가로 가운데')}
                    </button>
                    <button type="button" className="cc-action-btn" onClick={() => onGroupAlign?.('right')}>
                      {embedUiLabel('Align right', '오른쪽 정렬')}
                    </button>
                    <button type="button" className="cc-action-btn" onClick={() => onGroupAlign?.('top')}>
                      {embedUiLabel('Align top', '위 정렬')}
                    </button>
                    <button type="button" className="cc-action-btn" onClick={() => onGroupAlign?.('middle')}>
                      {embedUiLabel('Align middle', '세로 가운데')}
                    </button>
                    <button type="button" className="cc-action-btn" onClick={() => onGroupAlign?.('bottom')}>
                      {embedUiLabel('Align bottom', '아래 정렬')}
                    </button>
                    {groupDistributeEnabled ? (
                      <>
                        <button
                          type="button"
                          className="cc-action-btn"
                          onClick={() => onGroupDistribute?.('horizontal')}
                        >
                          {embedUiLabel('Distribute H', '가로 분배')}
                        </button>
                        <button
                          type="button"
                          className="cc-action-btn"
                          onClick={() => onGroupDistribute?.('vertical')}
                        >
                          {embedUiLabel('Distribute V', '세로 분배')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {targetForInspector ? (
                <StyleInspector
                  targetKind={inspectorFlags.targetKind}
                  cssPosition={inspectorFlags.cssPosition}
                  styles={draft.styles}
                  layoutEnabled={inspectorFlags.layoutEnabled}
                  mixedKeys={mixedStyleKeys}
                  mixedPlaceholder={mixedPlaceholder}
                  onChange={changeTargetStyle}
                  showTypography={inspectorFlags.showTypography}
                  showSize={inspectorFlags.showSize}
                  showPosition={inspectorFlags.showPosition}
                  showPositionHint={inspectorFlags.showPositionHint}
                  showLayout={inspectorFlags.showLayout}
                  showBox={inspectorFlags.showBox}
                  showArrange={inspectorFlags.showZOrder && Boolean(onZOrder)}
                  isMultiSelect={isMultiSelect}
                  zOrderCapabilities={zOrderCapabilities}
                  onZOrder={onZOrder}
                  zOrderBusy={zOrderBusy}
                />
              ) : !targetForInspector ? (
                <PageInspector
                  enabled={pageStylesEnabled}
                  onStyleChange={(styles) => {
                    const normalized = normalizeManualEditStyles(styles, { layoutEnabled: true });
                    if (!normalized.ok) {
                      onError('error' in normalized ? normalized.error : 'Invalid style value.');
                      onInvalidStyle?.('__body__', Object.keys(styles) as Array<keyof ManualEditStyles>);
                      return;
                    }
                    onError('');
                    onStyleChange?.(['__body__'], normalized.styles, 'Page styles');
                  }}
                />
              ) : null}

              {!isMultiSelect && targetForInspector?.kind === 'image' && onPickImage ? (
                <div className="cc-section">
                  <header className="cc-section-head">IMAGE</header>
                  <div className="cc-section-body">
                    <button
                      type="button"
                      className="cc-action-btn"
                      disabled={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingImage ? t('manualEdit.uploadingImage') : t('manualEdit.uploadImage')}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.currentTarget.files?.[0];
                        if (!file) return;
                        e.currentTarget.value = '';
                        setUploadingImage(true);
                        try {
                          const src = await onPickImage(file);
                          if (src) {
                            const activeTargetId = selectedTargetRef.current?.id ?? targetForInspector.id;
                            onApplyPatch(
                              { id: activeTargetId, kind: 'set-image', src, alt: draft.alt },
                              t('manualEdit.uploadImage'),
                            );
                          } else {
                            onError(t('manualEdit.uploadImageFailed'));
                          }
                        } finally {
                          setUploadingImage(false);
                        }
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="manual-edit-footer">
              <div className="manual-edit-footer-actions">
                <div className="manual-edit-footer-left">
                  {targetForInspector && !isMultiSelect ? (
                    confirmDelete ? (
                      <div className="manual-edit-delete-confirm">
                        <button
                          type="button"
                          className="manual-edit-delete-btn manual-edit-delete-confirm-action"
                          aria-label={t('manualEdit.deleteElement')}
                          title={canUndo ? t('manualEdit.deleteElementConfirm') : t('manualEdit.deleteElement')}
                          disabled={busy}
                          onClick={() => {
                            setConfirmDelete(false);
                            onApplyPatch(
                              { id: targetForInspector.id, kind: 'remove-element' },
                              t('manualEdit.deleteElement'),
                            );
                          }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                        <button
                          type="button"
                          className="manual-edit-footer-btn subtle"
                          disabled={busy}
                          onClick={() => setConfirmDelete(false)}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="manual-edit-delete-btn"
                        aria-label={t('manualEdit.deleteElement')}
                        title={t('manualEdit.deleteElement')}
                        disabled={busy}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    )
                  ) : null}
                </div>
                <div className="manual-edit-footer-right">
                  <button
                    type="button"
                    className="manual-edit-footer-btn subtle"
                    disabled={busy}
                    onClick={onCancelDraft}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="manual-edit-footer-btn primary"
                    disabled={busy}
                    onClick={onSaveDraft}
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>

              {error ? <div className="manual-edit-error">{error}</div> : null}
            </div>
          </>
        )}
      </section>
    </aside>
  );
}

function resolveManualEditInspectorFlags(
  selectedTargets: readonly ManualEditTarget[],
  primary: ManualEditTarget | null,
) {
  if (selectedTargets.length <= 1 && primary) {
    const positionValue = String(primary.cssPosition ?? 'static').toLowerCase();
    const showSize = primary.kind !== 'token';
    const showPosition = showSize && (
      isAnchoredCssPosition(positionValue) || positionValue === 'relative'
    );
    return {
      targetKind: primary.kind,
      cssPosition: primary.cssPosition,
      layoutEnabled: primary.isLayoutContainer,
      showTypography: primary.kind === 'text' || primary.kind === 'link' || primary.kind === 'token',
      showSize,
      showPosition,
      showPositionHint: showSize && !showPosition,
      showLayout: primary.isLayoutContainer,
      showBox: primary.kind === 'container' || primary.kind === 'image' || primary.kind === 'token',
      showZOrder: canAdjustZOrderTarget(positionValue),
    };
  }
  const kinds = selectedTargets.map((target) => target.kind);
  const showSize = kinds.some((kind) => kind !== 'token');
  const showPosition = showSize && selectedTargets.some((target) => {
    const positionValue = String(target.cssPosition ?? 'static').toLowerCase();
    return isAnchoredCssPosition(positionValue) || positionValue === 'relative';
  });
  return {
    targetKind: primary?.kind ?? 'container',
    cssPosition: primary?.cssPosition,
    layoutEnabled: selectedTargets.some((target) => target.isLayoutContainer),
    showTypography: kinds.some((kind) => kind === 'text' || kind === 'link' || kind === 'token'),
    showSize,
    showPosition,
    showPositionHint: showSize && !showPosition,
    showLayout: selectedTargets.some((target) => target.isLayoutContainer),
    showBox: kinds.some((kind) => kind === 'container' || kind === 'image' || kind === 'token'),
    showZOrder: selectedTargets.some((target) => canAdjustZOrderTarget(target.cssPosition)),
  };
}

function readableManualEditTargetName(target: ManualEditTarget): string {
  const explicit = firstReadableText(
    target.attributes['data-od-label'],
    target.attributes['aria-label'],
    target.attributes.title,
  );
  if (explicit) return explicit;

  if (target.kind === 'text' || target.kind === 'link' || target.kind === 'token') {
    const textName = readableContentName(target.text || target.fields.text || target.label);
    if (textName) return textName;
  }
  if (target.kind === 'image') {
    const imageName = readableContentName(target.fields.alt || target.label);
    if (imageName) return imageName;
  }

  const identifierName = readableIdentifierName(
    target.attributes.id ||
    target.attributes['data-od-id'] ||
    target.id,
  );
  if (identifierName) return identifierName;

  const className = readableClassName(target.className);
  if (className) return className;

  const labelName = readableContentName(target.label);
  if (labelName && !looksCodeLikeLabel(labelName)) return labelName;

  if (target.kind === 'container') return 'Container';
  if (target.kind === 'image') return 'Image';
  if (target.kind === 'link') return 'Link';
  return 'Text';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function firstReadableText(...values: Array<string | undefined>): string {
  for (const value of values) {
    const readable = readableContentName(value);
    if (readable) return readable;
  }
  return '';
}

function readableContentName(value: string | undefined): string {
  const clean = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (looksGeneratedIdentifier(clean)) return '';
  return clean.length > 42 ? `${clean.slice(0, 39).trim()}...` : clean;
}

function readableIdentifierName(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw || looksGeneratedIdentifier(raw)) return '';
  const lastSelectorPart = (raw.includes('.') ? raw.split('.').filter(Boolean).at(-1) : raw) ?? '';
  const lastIdPart = (lastSelectorPart.includes('#') ? lastSelectorPart.split('#').filter(Boolean).at(-1) : lastSelectorPart) ?? '';
  return humanizeIdentifier(lastIdPart);
}

function readableClassName(value: string | undefined): string {
  const classes = (value ?? '').split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const candidate = classes.find((item) => {
    const lower = item.toLowerCase();
    return !looksGeneratedIdentifier(item) && !['container', 'wrapper', 'group', 'section', 'row', 'col'].includes(lower);
  }) ?? classes.find((item) => !looksGeneratedIdentifier(item));
  return humanizeIdentifier(candidate);
}

function humanizeIdentifier(value: string | undefined): string {
  const clean = (value ?? '')
    .replace(/^[_#.\s-]+|[_#.\s-]+$/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || looksGeneratedIdentifier(clean)) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function looksCodeLikeLabel(value: string): boolean {
  return /^[a-z][a-z0-9-]*(?:[#.][\w-]+)+$/i.test(value) || /^[a-z][a-z0-9-]*\s+#/.test(value);
}

function looksGeneratedIdentifier(value: string): boolean {
  return /^path(?:-\d+)+$/i.test(value) || /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
}

function PageInspector({
  enabled,
  onStyleChange,
}: {
  enabled: boolean;
  onStyleChange: (styles: Partial<ManualEditStyles>) => void;
}) {
  const t = useT();
  const [bg, setBg] = useState('');
  const [font, setFont] = useState('');
  const [size, setSize] = useState('');
  const update = (next: { bg?: string; font?: string; size?: string }) => {
    if ('bg' in next) {
      const value = next.bg ?? '';
      setBg(value);
      onStyleChange({ backgroundColor: value });
    }
    if ('font' in next) {
      const value = next.font ?? '';
      setFont(value);
      onStyleChange({ fontFamily: value });
    }
    if ('size' in next) {
      const value = next.size ?? '';
      setSize(value);
      onStyleChange({ fontSize: value });
    }
  };

  return (
    <div className="cc-inspector">
      <Section title={embedUiLabel('PAGE', '페이지')}>
        {enabled ? (
          <>
            <ColorRow label={t('manualEdit.background')} value={bg} onChange={(value) => update({ bg: value })} />
            <FontRow value={font} onChange={(value) => update({ font: value })} />
            <UnitRow
              label={embedUiLabel('Base size', '기본 크기')}
              value={size}
              onChange={(value) => update({ size: value })}
              unit="px"
              autoUnit
            />
          </>
        ) : (
          <p className="cc-section-hint">
            {embedUiLabel(
              'Page styles are available only for full HTML documents.',
              '페이지 스타일은 전체 HTML 문서에서만 사용할 수 있습니다.',
            )}
          </p>
        )}
      </Section>
    </div>
  );
}

const FONT_OPTS = [
  { label: 'inherit', value: '' },
  { label: 'Space Grotesk', value: '"Space Grotesk", Inter, system-ui, sans-serif' },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Roboto', value: 'Roboto, Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'monospace', value: 'SFMono-Regular, Consolas, "Liberation Mono", monospace' },
] as const;
const WEIGHT_OPTS = ['', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
const ALIGN_OPTS = ['', 'left', 'center', 'right', 'justify', 'start', 'end'];
const DIRECTION_OPTS = ['', 'row', 'column', 'row-reverse', 'column-reverse'];
const JUSTIFY_OPTS = ['', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around'];
const ITEMS_OPTS = ['', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline'];
const BORDER_STYLE_OPTS = ['', 'solid', 'dashed', 'dotted', 'double', 'none'];
const EDITOR_SWATCH_COLORS = [
  '#000000',
  '#ffffff',
  '#374151',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

type NormalizeResult =
  | { ok: true; styles: Partial<ManualEditStyles> }
  | { ok: false; error: string };

const PX_STYLE_PROPS = new Set<keyof ManualEditStyles>([
  'fontSize', 'letterSpacing', 'width', 'height', 'minHeight', 'left', 'top', 'right', 'bottom', 'gap',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'border', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderRadius',
]);
const COLOR_STYLE_PROPS = new Set<keyof ManualEditStyles>(['color', 'backgroundColor', 'borderColor']);
const SELECT_STYLE_OPTIONS: Partial<Record<keyof ManualEditStyles, ReadonlyArray<string>>> = {
  fontFamily: FONT_OPTS.map((option) => option.value),
  fontWeight: WEIGHT_OPTS,
  textAlign: ALIGN_OPTS,
  flexDirection: DIRECTION_OPTS,
  justifyContent: JUSTIFY_OPTS,
  alignItems: ITEMS_OPTS,
  borderStyle: BORDER_STYLE_OPTS,
};
const LAYOUT_STYLE_PROPS = new Set<keyof ManualEditStyles>(['gap', 'flexDirection', 'justifyContent', 'alignItems']);

export function normalizeManualEditStyles(
  styles: Partial<ManualEditStyles>,
  { layoutEnabled }: { layoutEnabled: boolean },
): NormalizeResult {
  const normalized: Partial<ManualEditStyles> = {};
  for (const [rawKey, rawValue] of Object.entries(styles) as Array<[keyof ManualEditStyles, string]>) {
    if (LAYOUT_STYLE_PROPS.has(rawKey) && !layoutEnabled) continue;
    const value = rawValue.trim();
    if (value === '') {
      normalized[rawKey] = '';
      continue;
    }
    if (PX_STYLE_PROPS.has(rawKey)) {
      const px = normalizePxValue(value);
      if (!px) return { ok: false, error: `${styleLabel(rawKey)} must be a number or px value.` };
      normalized[rawKey] = px;
      continue;
    }
    if (COLOR_STYLE_PROPS.has(rawKey)) {
      const color = normalizeHexColor(value);
      if (!color) return { ok: false, error: `${styleLabel(rawKey)} must be a hex color.` };
      normalized[rawKey] = color;
      continue;
    }
    if (rawKey === 'opacity') {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: 'Opacity must be a number.' };
      normalized.opacity = String(Math.max(0, Math.min(1, n)));
      continue;
    }
    if (rawKey === 'zIndex') {
      const zIndex = value.toLowerCase() === 'auto' ? '' : value;
      if (zIndex !== '' && !/^-?\d+$/.test(zIndex)) {
        return { ok: false, error: 'Layer order must be a whole number.' };
      }
      normalized.zIndex = zIndex;
      continue;
    }
    if (rawKey === 'lineHeight') {
      const lineHeight = normalizeLineHeightValue(value);
      if (!lineHeight) return { ok: false, error: 'Line height must be a positive number or px value.' };
      normalized.lineHeight = lineHeight;
      continue;
    }
    const options = SELECT_STYLE_OPTIONS[rawKey];
    if (options) {
      if (!options.includes(value)) return { ok: false, error: `${styleLabel(rawKey)} has an unsupported value.` };
      normalized[rawKey] = value;
      continue;
    }
    normalized[rawKey] = value;
  }
  return { ok: true, styles: normalized };
}

function normalizePxValue(value: string): string | null {
  if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}px`;
  if (/^-?\d+(\.\d+)?px$/i.test(value)) return value.toLowerCase();
  return null;
}

function normalizeLineHeightValue(value: string): string | null {
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    return n > 0 ? String(n) : null;
  }
  if (/^\d+(\.\d+)?px$/i.test(value)) {
    const n = Number(value.slice(0, -2));
    return n > 0 ? value.toLowerCase() : null;
  }
  return null;
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const r = trimmed[1]!, g = trimmed[2]!, b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function styleLabel(key: keyof ManualEditStyles): string {
  return key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}

function zIndexInputValue(value: string | undefined): string {
  return normalizeManualEditZIndexValue(value ?? '');
}

function StyleInspector({
  targetKind,
  cssPosition,
  styles,
  layoutEnabled,
  mixedKeys,
  mixedPlaceholder = 'Mixed',
  onChange,
  showTypography: showTypographyProp,
  showSize: showSizeProp,
  showPosition: showPositionProp,
  showPositionHint: showPositionHintProp,
  showLayout: showLayoutProp,
  showBox: showBoxProp,
  showArrange = false,
  isMultiSelect = false,
  zOrderCapabilities = null,
  onZOrder,
  zOrderBusy = false,
}: {
  targetKind: ManualEditTarget['kind'];
  cssPosition?: string;
  styles: ManualEditStyles;
  layoutEnabled: boolean;
  mixedKeys?: ReadonlySet<keyof ManualEditStyles>;
  mixedPlaceholder?: string;
  onChange: (key: keyof ManualEditStyles, value: string) => void;
  showTypography?: boolean;
  showSize?: boolean;
  showPosition?: boolean;
  showPositionHint?: boolean;
  showLayout?: boolean;
  showBox?: boolean;
  showArrange?: boolean;
  isMultiSelect?: boolean;
  zOrderCapabilities?: ZOrderCapabilities | null;
  onZOrder?: (action: ZOrderAction) => void;
  zOrderBusy?: boolean;
}) {
  const t = useT();
  const u = (key: keyof ManualEditStyles, value: string) => onChange(key, value);
  const placeholderFor = (key: keyof ManualEditStyles) => (
    mixedKeys?.has(key) && !styles[key] ? mixedPlaceholder : ''
  );
  const showTypography = showTypographyProp ?? (targetKind === 'text' || targetKind === 'link' || targetKind === 'token');
  const showSize = showSizeProp ?? targetKind !== 'token';
  const positionValue = String(cssPosition ?? 'static').toLowerCase();
  const showPosition = showPositionProp ?? (
    showSize && (isAnchoredCssPosition(positionValue) || positionValue === 'relative')
  );
  const showPositionHint = showPositionHintProp ?? (showSize && !showPosition);
  const showLayout = showLayoutProp ?? layoutEnabled;
  const showBox = showBoxProp ?? (targetKind === 'container' || targetKind === 'image' || targetKind === 'token');

  return (
    <div className="cc-inspector">
      {showTypography ? (
        <Section title={embedUiLabel('TYPOGRAPHY', '타이포그래피')}>
          <FontRow value={styles.fontFamily} placeholder={placeholderFor('fontFamily')} onChange={(v) => u('fontFamily', v)} />
          <PairRow>
            <UnitRow label={embedUiLabel('Size', '크기')} value={styles.fontSize} placeholder={placeholderFor('fontSize')} onChange={(v) => u('fontSize', v)} unit="px" autoUnit />
            <DropdownRow label={t('manualEdit.weight')} value={styles.fontWeight} placeholder={placeholderFor('fontWeight')} onChange={(v) => u('fontWeight', v)} options={WEIGHT_OPTS} />
          </PairRow>
          <PairRow>
            <ColorRow label={embedUiLabel('Color', '색상')} value={styles.color} placeholder={placeholderFor('color')} onChange={(v) => u('color', v)} />
            <DropdownRow label={t('manualEdit.align')} value={styles.textAlign} placeholder={placeholderFor('textAlign')} onChange={(v) => u('textAlign', v)} options={ALIGN_OPTS} />
          </PairRow>
          <PairRow>
            <UnitRow label={embedUiLabel('Line', '행간')} value={styles.lineHeight} placeholder={placeholderFor('lineHeight')} onChange={(v) => u('lineHeight', v)} unit="" />
            <UnitRow label={embedUiLabel('Tracking', '자간')} value={styles.letterSpacing} placeholder={placeholderFor('letterSpacing')} onChange={(v) => u('letterSpacing', v)} unit="px" autoUnit />
          </PairRow>
        </Section>
      ) : null}

      {showSize ? (
        <Section title={embedUiLabel('SIZE', '크기')}>
          <PairRow>
            <UnitRow label={t('manualEdit.width')} value={styles.width} placeholder={placeholderFor('width')} onChange={(v) => u('width', v)} unit="px" autoUnit />
            <UnitRow label={embedUiLabel('Height', '높이')} value={styles.height} placeholder={placeholderFor('height')} onChange={(v) => u('height', v)} unit="px" autoUnit />
          </PairRow>
        </Section>
      ) : null}

      {showPosition ? (
        <Section title={embedUiLabel('POSITION', '위치')}>
          <PairRow>
            <UnitRow label={embedUiLabel('Left', '왼쪽')} value={styles.left} placeholder={placeholderFor('left')} onChange={(v) => u('left', v)} unit="px" autoUnit />
            <UnitRow label={embedUiLabel('Top', '위')} value={styles.top} placeholder={placeholderFor('top')} onChange={(v) => u('top', v)} unit="px" autoUnit />
          </PairRow>
          {canAdjustZOrderTarget(positionValue) ? (
            <UnitRow
              label={t('manualEdit.zIndex')}
              value={zIndexInputValue(styles.zIndex)}
              placeholder={mixedKeys?.has('zIndex') && !styles.zIndex ? mixedPlaceholder : t('manualEdit.zIndexAuto')}
              onChange={(v) => u('zIndex', v)}
              unit=""
              integerStep
            />
          ) : null}
        </Section>
      ) : null}

      {showPositionHint ? (
        <Section title={embedUiLabel('POSITION', '위치')} inactive>
          <p className="cc-section-hint" data-testid="manual-edit-position-hint">
            {targetKind === 'image'
              ? t('manualEdit.positionMoveRequiresAbsolute')
              : positionValue === 'sticky'
                ? t('manualEdit.positionPromoteStickyOnDrag')
                : t('manualEdit.positionPromoteOnDrag')}
          </p>
        </Section>
      ) : null}

      {showLayout ? (
        <Section title={embedUiLabel('LAYOUT', '레이아웃')}>
          <PairRow>
            <UnitRow label={embedUiLabel('Gap', '간격')} value={styles.gap} placeholder={placeholderFor('gap')} onChange={(v) => u('gap', v)} unit="px" autoUnit />
            <DropdownRow label={embedUiLabel('Direction', '방향')} value={styles.flexDirection} placeholder={placeholderFor('flexDirection')} onChange={(v) => u('flexDirection', v)} options={DIRECTION_OPTS} />
          </PairRow>
          <PairRow>
            <DropdownRow label={embedUiLabel('Justify', '주축')} value={styles.justifyContent} placeholder={placeholderFor('justifyContent')} onChange={(v) => u('justifyContent', v)} options={JUSTIFY_OPTS} />
            <DropdownRow label={t('manualEdit.align')} value={styles.alignItems} placeholder={placeholderFor('alignItems')} onChange={(v) => u('alignItems', v)} options={ITEMS_OPTS} />
          </PairRow>
        </Section>
      ) : null}

      {showBox ? (
      <Section title={embedUiLabel('BOX', '박스')}>
        <PairRow>
          <ColorRow label={embedUiLabel('Fill', '채우기')} value={styles.backgroundColor} placeholder={placeholderFor('backgroundColor')} onChange={(v) => u('backgroundColor', v)} />
          <UnitRow label={embedUiLabel('Opacity', '불투명도')} value={styles.opacity} placeholder={placeholderFor('opacity')} onChange={(v) => u('opacity', v)} unit="" />
        </PairRow>

        <QuadRow label={t('manualEdit.padding')} values={{
          t: styles.paddingTop, r: styles.paddingRight, b: styles.paddingBottom, l: styles.paddingLeft,
        }} sideKeys={{
          t: 'paddingTop', r: 'paddingRight', b: 'paddingBottom', l: 'paddingLeft',
        }} mixedKeys={mixedKeys} mixedPlaceholder={mixedPlaceholder} onChange={(side, value) => u(sideToProp('padding', side), value)} />

        <QuadRow label={t('manualEdit.margin')} values={{
          t: styles.marginTop, r: styles.marginRight, b: styles.marginBottom, l: styles.marginLeft,
        }} sideKeys={{
          t: 'marginTop', r: 'marginRight', b: 'marginBottom', l: 'marginLeft',
        }} mixedKeys={mixedKeys} mixedPlaceholder={mixedPlaceholder} onChange={(side, value) => u(sideToProp('margin', side), value)} />

        <QuadRow label={t('manualEdit.border')} values={{
          t: styles.borderTopWidth, r: styles.borderRightWidth, b: styles.borderBottomWidth, l: styles.borderLeftWidth,
        }} sideKeys={{
          t: 'borderTopWidth', r: 'borderRightWidth', b: 'borderBottomWidth', l: 'borderLeftWidth',
        }} mixedKeys={mixedKeys} mixedPlaceholder={mixedPlaceholder} onChange={(side, value) => u(`border${sideUpper(side)}Width` as keyof ManualEditStyles, value)} />

        <PairRow>
          <DropdownRow label={embedUiLabel('Style', '스타일')} value={styles.borderStyle} placeholder={placeholderFor('borderStyle')} onChange={(v) => u('borderStyle', v)} options={BORDER_STYLE_OPTS} />
          <ColorRow label={t('manualEdit.border')} value={styles.borderColor} placeholder={placeholderFor('borderColor')} onChange={(v) => u('borderColor', v)} compact />
        </PairRow>
        <UnitRow label={t('manualEdit.radius')} value={styles.borderRadius} placeholder={placeholderFor('borderRadius')} onChange={(v) => u('borderRadius', v)} unit="px" autoUnit />
      </Section>
      ) : null}

      {showArrange && onZOrder ? (
        <Section title={t('manualEdit.arrange')} testId="manual-edit-arrange-section">
          {isMultiSelect ? (
            <p className="cc-section-hint">{t('manualEdit.arrangeMultiHint')}</p>
          ) : null}
          <ManualEditZOrderControls
            capabilities={zOrderCapabilities ?? DISABLED_Z_ORDER_CAPABILITIES}
            disabled={zOrderBusy}
            onZOrder={onZOrder}
          />
          {!isMultiSelect && !showPosition && canAdjustZOrderTarget(positionValue) ? (
            <UnitRow
              label={t('manualEdit.zIndex')}
              value={zIndexInputValue(styles.zIndex)}
              placeholder={mixedKeys?.has('zIndex') && !styles.zIndex ? mixedPlaceholder : t('manualEdit.zIndexAuto')}
              onChange={(v) => u('zIndex', v)}
              unit=""
              integerStep
            />
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children, inactive, testId }: {
  title: string;
  children: React.ReactNode;
  inactive?: boolean;
  testId?: string;
}) {
  return (
    <section className={`cc-section${inactive ? ' cc-section-inactive' : ''}`} data-testid={testId}>
      <header className="cc-section-head">{title}</header>
      <div className="cc-section-body">{children}</div>
    </section>
  );
}

function PairRow({ children }: { children: React.ReactNode }) {
  return <div className="cc-pair">{children}</div>;
}

function UnitRow({ label, value, onChange, unit, autoUnit, disabled, placeholder, integerStep }: {
  label: string; value: string; onChange: (v: string) => void;
  unit: string; autoUnit?: boolean; disabled?: boolean; placeholder?: string;
  integerStep?: boolean;
}) {
  const display = unit === 'px' ? stripPxUnit(value) : value;
  const step = integerStep ? 1 : (unit === 'px' ? 1 : 0.1);
  const canStep = !disabled && isNumericInput(display);
  const valueFromDisplay = (raw: string) => {
    const trimmed = raw.trim();
    if (autoUnit && trimmed && isNumericInput(trimmed)) return `${trimmed}px`;
    if (autoUnit && /^-?\d+(\.\d+)?px$/i.test(trimmed)) return trimmed.toLowerCase();
    return raw;
  };
  const handle = (raw: string) => {
    const next = valueFromDisplay(raw);
    if (next !== value) onChange(next);
  };
  const stepBy = (direction: -1 | 1) => {
    if (!canStep) return;
    if (integerStep) {
      const current = Number.parseInt(display, 10);
      if (!Number.isFinite(current)) return;
      onChange(String(current + direction * step));
      return;
    }
    const next = formatSteppedNumber(Number(display) + direction * step, display, step);
    onChange(valueFromDisplay(next));
  };
  return (
    <label className="cc-row">
      <span className="cc-label">{label}</span>
      <span className="cc-value">
        <button type="button" className="cc-step" disabled={!canStep} aria-label={embedUiLabel(`${label} decrease`, `${label} 감소`)} onClick={() => stepBy(-1)}>−</button>
        <input value={display} placeholder={placeholder ?? ''} disabled={disabled} onChange={(e) => onChange(valueFromDisplay(e.currentTarget.value))} onBlur={(e) => handle(e.currentTarget.value)} />
        <button type="button" className="cc-step" disabled={!canStep} aria-label={embedUiLabel(`${label} increase`, `${label} 증가`)} onClick={() => stepBy(1)}>+</button>
        {unit ? <em className="cc-unit">{unit}</em> : null}
      </span>
    </label>
  );
}

function DropdownRow({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: ReadonlyArray<string>; placeholder?: string; disabled?: boolean;
}) {
  const emptyLabel = placeholder ?? '–';
  return (
    <label className="cc-row">
      <span className="cc-label">{label}</span>
      <span className="cc-value cc-select">
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.currentTarget.value)}>
          {!options.includes(value) && value ? <option value={value}>{value}</option> : null}
          {options.map((opt) => <option key={opt || '__'} value={opt}>{opt || emptyLabel}</option>)}
        </select>
        <em className="cc-chevron">▾</em>
      </span>
    </label>
  );
}

function FontRow({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const normalizedValue = normalizeFontFamilyForSelect(value);
  const customValue = normalizedValue === value ? value : '';
  return (
    <label className="cc-row">
      <span className="cc-label">Font</span>
      <span className="cc-value cc-select">
        <select value={normalizedValue} onChange={(event) => onChange(event.currentTarget.value)}>
          {!normalizedValue && placeholder ? <option value="">{placeholder}</option> : null}
          {customValue && !FONT_OPTS.some((option) => option.value === customValue) ? (
            <option value={customValue}>{fontFamilyLabel(customValue)}</option>
          ) : null}
          {FONT_OPTS.map((option) => (
            <option key={option.label} value={option.value}>{option.label}</option>
          ))}
        </select>
        <em className="cc-chevron">▾</em>
      </span>
    </label>
  );
}

function normalizeFontFamilyForSelect(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const direct = FONT_OPTS.find((option) => option.value === trimmed);
  if (direct) return direct.value;
  const families = parseFontFamilies(trimmed);
  const primaryFamily = families[0];
  const match = FONT_OPTS.find((option) => {
    if (!option.value) return false;
    const optionFamilies = parseFontFamilies(option.value);
    return optionFamilies[0] === primaryFamily;
  });
  return match?.value ?? trimmed;
}

function fontFamilyLabel(value: string): string {
  return parseFontFamilies(value)[0] ?? value;
}

function parseFontFamilies(value: string): string[] {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .filter(Boolean);
}

function ColorRow({ label, value, onChange, compact, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; compact?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  return (
    <label className="cc-row">
      {compact ? null : <span className="cc-label">{label}</span>}
      <span className={`cc-value cc-color ${compact ? 'cc-color-compact' : ''}`} ref={ref}>
        <button type="button" className="cc-swatch" style={{ background: value || 'transparent' }}
          onClick={() => setOpen((v) => !v)} aria-label={embedUiLabel(`Pick ${label}`, `${label} 선택`)} />
        <input value={value} placeholder={placeholder || '#000000'}
          onChange={(e) => onChange(e.currentTarget.value)} onFocus={() => setOpen(true)} />
        {open ? (
          <div className="cc-color-popover">
            <div className="cc-color-grid">
              {EDITOR_SWATCH_COLORS.map((hex) => (
                <button key={hex} type="button" className="cc-color-tile" style={{ background: hex }}
                  onClick={() => { onChange(hex); setOpen(false); }} aria-label={hex} />
              ))}
            </div>
            <input type="color" className="cc-color-native" value={normalizeColorForPicker(value)}
              onChange={(e) => onChange(e.currentTarget.value)} />
          </div>
        ) : null}
      </span>
    </label>
  );
}

function QuadRow({ label, values, onChange, sideKeys, mixedKeys, mixedPlaceholder }: {
  label: string; values: { t: string; r: string; b: string; l: string };
  sideKeys: { t: keyof ManualEditStyles; r: keyof ManualEditStyles; b: keyof ManualEditStyles; l: keyof ManualEditStyles };
  mixedKeys?: ReadonlySet<keyof ManualEditStyles>;
  mixedPlaceholder?: string;
  onChange: (side: 't' | 'r' | 'b' | 'l', value: string) => void;
}) {
  const placeholderFor = (side: 't' | 'r' | 'b' | 'l', value: string) => (
    mixedKeys?.has(sideKeys[side]) && !value ? mixedPlaceholder ?? '' : ''
  );
  const [open, setOpen] = useState(true);
  const allEqualValue = (() => {
    const v = values.t;
    return v === values.r && v === values.b && v === values.l ? v : null;
  })();
  return (
    <div className="cc-quad">
      <button type="button" className="cc-quad-head" onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>
        {!open && allEqualValue !== null ? <em>{allEqualValue || '0 px'}</em> : <span className="cc-chevron-small">{open ? '▾' : '▸'}</span>}
      </button>
      {open ? (
        <div className="cc-quad-grid">
          <QuadCell axis="T" value={values.t} placeholder={placeholderFor('t', values.t)} onChange={(v) => onChange('t', v)} />
          <QuadCell axis="R" value={values.r} placeholder={placeholderFor('r', values.r)} onChange={(v) => onChange('r', v)} />
          <QuadCell axis="B" value={values.b} placeholder={placeholderFor('b', values.b)} onChange={(v) => onChange('b', v)} />
          <QuadCell axis="L" value={values.l} placeholder={placeholderFor('l', values.l)} onChange={(v) => onChange('l', v)} />
        </div>
      ) : null}
    </div>
  );
}

function QuadCell({ axis, value, onChange, placeholder }: { axis: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const display = stripPxUnit(value);
  const canStep = isNumericInput(display);
  const stepBy = (direction: -1 | 1) => {
    if (!canStep) return;
    onChange(`${formatSteppedNumber(Number(display) + direction, display, 1)}px`);
  };
  return (
    <span className="cc-quad-cell">
      <em className="cc-quad-axis">{axis}</em>
      <button type="button" className="cc-step cc-step-quad" disabled={!canStep} aria-label={embedUiLabel(`${axis} decrease`, `${axis} 감소`)} onClick={() => stepBy(-1)}>−</button>
      <input value={display} placeholder={placeholder ?? '0'}
        onChange={(e) => {
          const raw = e.currentTarget.value.trim();
          if (raw === '') onChange('');
          else if (isNumericInput(raw)) onChange(`${raw}px`);
          else if (/^-?\d+(\.\d+)?px$/i.test(raw)) onChange(raw.toLowerCase());
          else onChange(e.currentTarget.value);
        }}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          const next = v && isNumericInput(v) ? `${v}px` : e.currentTarget.value;
          if (next !== value) onChange(next);
        }} />
      <button type="button" className="cc-step cc-step-quad" disabled={!canStep} aria-label={embedUiLabel(`${axis} increase`, `${axis} 증가`)} onClick={() => stepBy(1)}>+</button>
      <em className="cc-quad-unit">px</em>
    </span>
  );
}

function stripPxUnit(value: string): string {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match?.[1] ?? value;
}

function isNumericInput(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function formatSteppedNumber(value: number, current: string, step: number): string {
  const decimals = Math.max(decimalPlaces(current), decimalPlaces(String(step)));
  return decimals > 0
    ? value.toFixed(decimals).replace(/\.?0+$/, '')
    : String(Math.round(value));
}

function decimalPlaces(value: string): number {
  const match = value.match(/\.(\d+)/);
  return match?.[1]?.length ?? 0;
}

function sideToProp(base: 'padding' | 'margin', side: 't' | 'r' | 'b' | 'l'): keyof ManualEditStyles {
  return `${base}${sideUpper(side)}` as keyof ManualEditStyles;
}
function sideUpper(side: 't' | 'r' | 'b' | 'l'): 'Top' | 'Right' | 'Bottom' | 'Left' {
  return side === 't' ? 'Top' : side === 'r' ? 'Right' : side === 'b' ? 'Bottom' : 'Left';
}

function normalizeColorForPicker(value: string): string {
  const trimmed = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    if (trimmed.length === 4) {
      const r = trimmed[1]!, g = trimmed[2]!, b = trimmed[3]!;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return trimmed.toLowerCase();
  }
  const match = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    const toHex = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
    return `#${toHex(match[1]!)}${toHex(match[2]!)}${toHex(match[3]!)}`;
  }
  return '#000000';
}

export function manualEditPatchSummary(patch: ManualEditPatch): string {
  if (patch.kind === 'set-full-source') return JSON.stringify({ kind: patch.kind, bytes: patch.source.length });
  if (patch.kind === 'set-outer-html') return JSON.stringify({ id: patch.id, kind: patch.kind, bytes: patch.html.length });
  return JSON.stringify(patch);
}
