// "Finalize design package" toolbar action — #451. Triggers the
// daemon's POST /api/projects/:id/finalize/<provider>, which
// synchronously synthesizes DESIGN.md from the project transcript +
// active design system + current artifact (route owned by PR #832,
// merged 2026-05-08 by lefarcen).
//
// Renders three label states based on whether DESIGN.md exists and
// whether it's stale; clicks during a pending request show a spinner
// + cancel link instead. Error toasts are rendered by ProjectView
// (the toolbar wires them through useFinalizeProject's `error`
// surface), so this component intentionally has no toast of its own.

import type { DesignMdState } from '../hooks/useDesignMdState';
import type { FinalizeStatus } from '../hooks/useFinalizeProject';
import { embedUiLabel } from '../teamver/embedUiLabels';

export interface FinalizeDesignButtonProps {
  designMdState: Pick<DesignMdState, 'exists' | 'isStale'>;
  status: FinalizeStatus;
  onFinalize: () => void;
  onCancel: () => void;
}

export function FinalizeDesignButton({
  designMdState,
  status,
  onFinalize,
  onCancel,
}: FinalizeDesignButtonProps) {
  if (status === 'pending') {
    return (
      <div className="project-actions-button project-actions-button-pending" role="group">
        <span className="project-actions-spinner" aria-hidden="true" />
        <span className="project-actions-label">
          {embedUiLabel('Finalizing…', '마무리 중…')}
        </span>
        <button
          type="button"
          className="project-actions-link"
          onClick={onCancel}
          aria-label={embedUiLabel('Cancel finalize', '마무리 취소')}
        >
          {embedUiLabel('Cancel', '취소')}
        </button>
      </div>
    );
  }

  let label: string;
  let variantClass: string;
  if (!designMdState.exists) {
    label = embedUiLabel('Finalize design package', '디자인 패키지 마무리');
    variantClass = 'project-actions-button-primary';
  } else if (designMdState.isStale) {
    label = embedUiLabel('Re-finalize (spec is stale)', '다시 마무리 (스펙 오래됨)');
    variantClass = 'project-actions-button-warning';
  } else {
    label = embedUiLabel('Re-finalize', '다시 마무리');
    variantClass = 'project-actions-button-secondary';
  }

  return (
    <button
      type="button"
      className={`project-actions-button ${variantClass}`}
      onClick={onFinalize}
    >
      {label}
    </button>
  );
}
