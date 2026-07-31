import { RemixIcon } from './RemixIcon';

type FileViewerUndoRedoToolbarProps = {
  canUndo: boolean;
  canRedo: boolean;
  busy?: boolean;
  undoTooltip?: string;
  redoTooltip?: string;
  onUndo: () => void;
  onRedo: () => void;
  t: (key: 'manualEdit.undo' | 'manualEdit.redo') => string;
};

export function FileViewerUndoRedoToolbar({
  canUndo,
  canRedo,
  busy = false,
  undoTooltip,
  redoTooltip,
  onUndo,
  onRedo,
  t,
}: FileViewerUndoRedoToolbarProps) {
  const undoLabel = undoTooltip ?? t('manualEdit.undo');
  const redoLabel = redoTooltip ?? t('manualEdit.redo');
  return (
    <>
      <button
        type="button"
        className="viewer-action viewer-action-icon od-tooltip"
        data-testid="file-viewer-undo"
        data-tooltip={undoLabel}
        data-tooltip-placement="bottom"
        title={undoLabel}
        aria-label={undoLabel}
        disabled={!canUndo || busy}
        onClick={onUndo}
      >
        <RemixIcon name="arrow-go-back-line" size={15} />
      </button>
      <button
        type="button"
        className="viewer-action viewer-action-icon od-tooltip"
        data-testid="file-viewer-redo"
        data-tooltip={redoLabel}
        data-tooltip-placement="bottom"
        title={redoLabel}
        aria-label={redoLabel}
        disabled={!canRedo || busy}
        onClick={onRedo}
      >
        <RemixIcon name="arrow-go-forward-line" size={15} />
      </button>
    </>
  );
}
