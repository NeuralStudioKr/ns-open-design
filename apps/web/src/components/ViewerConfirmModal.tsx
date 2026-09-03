import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Shared viewer-modal confirm — replaces native window.confirm on embed/desktop. */
export function ViewerConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-backdrop viewer-modal-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="modal deploy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <p className="subtitle">{message}</p>
        </div>
        <div className="modal-foot">
          <button
            type="button"
            className="ghost-link button-like"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="viewer-action primary"
            data-testid="viewer-confirm-accept"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
