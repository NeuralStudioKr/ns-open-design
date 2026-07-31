import { RemixIcon } from './RemixIcon';

type FileViewerUndoRedoToolbarProps = {
  canUndo: boolean;
  canRedo: boolean;
  busy?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  t: (key: 'manualEdit.undo' | 'manualEdit.redo') => string;
};

export function FileViewerUndoRedoToolbar({
  canUndo,
  canRedo,
  busy = false,
  onUndo,
  onRedo,
  t,
}: FileViewerUndoRedoToolbarProps) {
  return (
    <>
      <button
        type="button"
        className="viewer-action viewer-action-icon od-tooltip"
        data-testid="file-viewer-undo"
        data-tooltip={t('manualEdit.undo')}
        data-tooltip-placement="bottom"
        title={t('manualEdit.undo')}
        aria-label={t('manualEdit.undo')}
        disabled={!canUndo || busy}
        onClick={onUndo}
      >
        <RemixIcon name="arrow-go-back-line" size={15} />
      </button>
      <button
        type="button"
        className="viewer-action viewer-action-icon od-tooltip"
        data-testid="file-viewer-redo"
        data-tooltip={t('manualEdit.redo')}
        data-tooltip-placement="bottom"
        title={t('manualEdit.redo')}
        aria-label={t('manualEdit.redo')}
        disabled={!canRedo || busy}
        onClick={onRedo}
      >
        <RemixIcon name="arrow-go-forward-line" size={15} />
      </button>
    </>
  );
}
