import { useT } from '../i18n';
import type { ManualEditTarget } from '../edit-mode/types';

export type ManualEditLayersPanelProps = {
  targets: ManualEditTarget[];
  selectedIds: string[];
  onSelectTarget: (target: ManualEditTarget, options?: { additive?: boolean }) => void;
  onClose: () => void;
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
  selectedIds,
  onSelectTarget,
  onClose,
}: ManualEditLayersPanelProps) {
  const t = useT();

  return (
    <aside className="manual-edit-layers" data-testid="manual-edit-layers-panel">
      <div className="manual-edit-panel-head">
        <div className="manual-edit-layers-head-copy">
          <h3>{t('manualEdit.layers')}</h3>
          <p className="manual-edit-layers-hint">{t('manualEdit.layersHint')}</p>
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
      {targets.length === 0 ? (
        <p className="manual-edit-layer-empty">{t('manualEdit.noEditableLayers')}</p>
      ) : (
        <div
          className="manual-edit-layer-list"
          role="listbox"
          aria-multiselectable="true"
          aria-label={t('manualEdit.layers')}
        >
          {[...targets].reverse().map((target) => {
            const selected = selectedIds.includes(target.id);
            const primary = selectedIds[selectedIds.length - 1] === target.id;
            return (
              <button
                key={target.id}
                type="button"
                role="option"
                aria-selected={selected}
                data-testid={`manual-edit-layer-row-${target.id}`}
                className={[
                  'manual-edit-layer-row',
                  selected ? 'selected' : '',
                  primary ? 'primary' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={(event) => {
                  const additive = event.metaKey || event.ctrlKey || event.shiftKey;
                  onSelectTarget(target, { additive });
                }}
              >
                <strong>{layerLabel(target)}</strong>
                <span>
                  {target.tagName.toLowerCase()}
                  {target.cssPosition ? ` · ${target.cssPosition}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
