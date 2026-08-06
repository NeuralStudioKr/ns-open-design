import { useState, type DragEvent } from 'react';
import { useT } from '../i18n';
import type { ManualEditTarget } from '../edit-mode/types';
import {
  canAdjustZOrderTarget,
  readStackZFromZIndexStyle,
  type ZOrderAction,
  type ZOrderCapabilities,
} from '../edit-mode/manual-edit-z-order';
import {
  canDragLayerRow,
  canDropLayerOnTarget,
} from '../edit-mode/manual-edit-layer-reorder';
import { ManualEditZOrderControls } from './ManualEditZOrderControls';
import { embedUiLabel } from '../teamver/embedUiLabels';

export type ManualEditLayersPanelProps = {
  targets: ManualEditTarget[];
  allTargets?: ManualEditTarget[];
  deck?: boolean;
  activeSlideIndex?: number | null;
  selectedIds: string[];
  onSelectTarget: (target: ManualEditTarget, options?: { additive?: boolean }) => void;
  onClose: () => void;
  zOrderCapabilities?: ZOrderCapabilities | null;
  onZOrder?: (action: ZOrderAction) => void;
  onLayerReorder?: (draggedId: string, insertBeforeId: string | null) => void;
  zOrderBusy?: boolean;
};

function layerLabel(target: ManualEditTarget): string {
  const label = target.label?.trim();
  if (label) return label;
  const tag = target.tagName?.toLowerCase() || 'element';
  const id = target.attributes['data-od-id'];
  return id ? `${tag} (${id})` : tag;
}

export function ManualEditLayersPanel({
  targets,
  allTargets = targets,
  deck = false,
  activeSlideIndex = null,
  selectedIds,
  onSelectTarget,
  onClose,
  zOrderCapabilities = null,
  onZOrder,
  onLayerReorder,
  zOrderBusy = false,
}: ManualEditLayersPanelProps) {
  const t = useT();
  const primaryId = selectedIds.length === 1 ? selectedIds[0] : null;
  const showZOrder = Boolean(primaryId && zOrderCapabilities && onZOrder);
  const reorderOptions = { deck, activeSlideIndex };
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null | undefined>(undefined);

  const finishDrag = () => {
    setDraggingId(null);
    setDropBeforeId(undefined);
  };

  const handleDragStart = (target: ManualEditTarget, event: DragEvent<HTMLButtonElement>) => {
    if (zOrderBusy || !onLayerReorder) return;
    if (!canDragLayerRow(target, targets, allTargets, reorderOptions)) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', target.id);
    setDraggingId(target.id);
  };

  const handleDragOver = (overId: string | null, event: DragEvent<HTMLElement>) => {
    if (!draggingId || !onLayerReorder) return;
    if (!canDropLayerOnTarget(draggingId, overId, allTargets, reorderOptions)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropBeforeId(overId);
  };

  const handleDrop = (insertBeforeId: string | null, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain') || draggingId;
    finishDrag();
    if (!draggedId || !onLayerReorder) return;
    if (!canDropLayerOnTarget(draggedId, insertBeforeId, allTargets, reorderOptions)) return;
    onLayerReorder(draggedId, insertBeforeId);
  };

  return (
    <aside className="manual-edit-layers" data-testid="manual-edit-layers-panel">
      <div className="manual-edit-panel-head">
        <div className="manual-edit-layers-head-copy">
          <h3>{t('manualEdit.layers')}</h3>
          <p className="manual-edit-layers-hint">{t('manualEdit.layersHint')}</p>
          {onLayerReorder ? (
            <p className="manual-edit-layers-hint">
              {embedUiLabel(
                'Drag layers to reorder siblings (z-index).',
                '레이어를 드래그해 형제 요소의 겹침 순서(z-index)를 바꿉니다.',
              )}
            </p>
          ) : null}
        </div>
        <div className="manual-edit-layers-head-actions">
          <span className="manual-edit-layers-count">
            {t('manualEdit.editableCount', { count: targets.length })}
          </span>
          <button
            type="button"
            className="manual-edit-layers-close"
            data-testid="manual-edit-layers-close"
            aria-label={t('manualEdit.closeLayers')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>
      {showZOrder && zOrderCapabilities ? (
        <div className="manual-edit-layers-arrange" data-testid="manual-edit-layers-arrange">
          <span className="manual-edit-layers-arrange-label">
            {embedUiLabel('Arrange', '순서')}
          </span>
          <ManualEditZOrderControls
            compact
            disabled={zOrderBusy}
            capabilities={zOrderCapabilities}
            onZOrder={onZOrder!}
          />
        </div>
      ) : null}
      {targets.length === 0 ? (
        <p className="manual-edit-layer-empty">{t('manualEdit.noEditableLayers')}</p>
      ) : (
        <div
          className="manual-edit-layer-list"
          role="listbox"
          aria-multiselectable="true"
          aria-label={t('manualEdit.layers')}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDropBeforeId(undefined);
          }}
        >
          {[...targets].map((target) => {
            const selected = selectedIds.includes(target.id);
            const primary = selectedIds[selectedIds.length - 1] === target.id;
            const draggable = Boolean(
              onLayerReorder
              && !zOrderBusy
              && canDragLayerRow(target, targets, allTargets, reorderOptions),
            );
            const showStackZ = canAdjustZOrderTarget(target.cssPosition);
            const stackZLabel = showStackZ
              ? (
                target.styles.zIndex?.trim()
                  ? `z ${readStackZFromZIndexStyle(target.styles.zIndex)}`
                  : embedUiLabel('z auto', 'z auto')
              )
              : '';
            const showDropMarker = draggingId && dropBeforeId === target.id;
            return (
              <div key={target.id} className="manual-edit-layer-row-wrap">
                {showDropMarker ? (
                  <div className="manual-edit-layer-drop-marker" aria-hidden />
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  draggable={draggable}
                  data-testid={`manual-edit-layer-row-${target.id}`}
                  data-draggable={draggable ? 'true' : 'false'}
                  className={[
                    'manual-edit-layer-row',
                    selected ? 'selected' : '',
                    primary ? 'primary' : '',
                    draggingId === target.id ? 'dragging' : '',
                    showDropMarker ? 'drop-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={(event) => {
                    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
                    onSelectTarget(target, { additive });
                  }}
                  onDragStart={(event) => handleDragStart(target, event)}
                  onDragEnd={finishDrag}
                  onDragOver={(event) => handleDragOver(target.id, event)}
                  onDrop={(event) => handleDrop(target.id, event)}
                >
                  {draggable ? (
                    <span className="manual-edit-layer-drag-handle" aria-hidden>
                      ⋮⋮
                    </span>
                  ) : null}
                  <span className="manual-edit-layer-row-copy">
                    <strong>{layerLabel(target)}</strong>
                    <span>
                      {target.tagName.toLowerCase()}
                      {target.cssPosition ? ` · ${target.cssPosition}` : ''}
                      {stackZLabel ? ` · ${stackZLabel}` : ''}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
          {draggingId && dropBeforeId === null ? (
            <div className="manual-edit-layer-drop-marker manual-edit-layer-drop-marker--end" aria-hidden />
          ) : null}
          <div
            className="manual-edit-layer-drop-tail"
            onDragOver={(event) => handleDragOver(null, event)}
            onDrop={(event) => handleDrop(null, event)}
          />
        </div>
      )}
    </aside>
  );
}
