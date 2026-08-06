import { embedUiLabel } from '../teamver/embedUiLabels';
import type { ZOrderAction, ZOrderCapabilities } from '../edit-mode/manual-edit-z-order';

export type ManualEditZOrderControlsProps = {
  capabilities: ZOrderCapabilities;
  disabled?: boolean;
  compact?: boolean;
  onZOrder: (action: ZOrderAction) => void;
};

const ACTIONS: Array<{ action: ZOrderAction; labelEn: string; labelKo: string; testId: string }> = [
  { action: 'back', labelEn: 'Send to back', labelKo: '맨 뒤로', testId: 'manual-edit-z-back' },
  { action: 'backward', labelEn: 'Send backward', labelKo: '뒤로', testId: 'manual-edit-z-backward' },
  { action: 'forward', labelEn: 'Bring forward', labelKo: '앞으로', testId: 'manual-edit-z-forward' },
  { action: 'front', labelEn: 'Bring to front', labelKo: '맨 앞으로', testId: 'manual-edit-z-front' },
];

export function ManualEditZOrderControls({
  capabilities,
  disabled = false,
  compact = false,
  onZOrder,
}: ManualEditZOrderControlsProps) {
  return (
    <div
      className={[
        'manual-edit-zorder-grid',
        compact ? 'manual-edit-zorder-grid--compact' : '',
      ].filter(Boolean).join(' ')}
      data-testid="manual-edit-zorder-controls"
    >
      {ACTIONS.map(({ action, labelEn, labelKo, testId }) => (
        <button
          key={action}
          type="button"
          className="cc-action-btn manual-edit-zorder-btn"
          data-testid={testId}
          disabled={disabled || !capabilities[action]}
          title={embedUiLabel(labelEn, labelKo)}
          aria-label={embedUiLabel(labelEn, labelKo)}
          onClick={(event) => {
            event.stopPropagation();
            onZOrder(action);
          }}
        >
          {compact
            ? embedUiLabel(shortLabel(action, labelEn), shortLabel(action, labelKo))
            : embedUiLabel(labelEn, labelKo)}
        </button>
      ))}
    </div>
  );
}

function shortLabel(action: ZOrderAction, fallback: string): string {
  switch (action) {
    case 'back':
      return 'Back';
    case 'backward':
      return '↓';
    case 'forward':
      return '↑';
    case 'front':
      return 'Front';
    default:
      return fallback;
  }
}
