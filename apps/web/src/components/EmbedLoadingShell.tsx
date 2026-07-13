import { resolveLoadingShellLabel } from '../teamver/branding/loadingShellLabel';

type Props = {
  /** Override label; defaults to the unified embed/OD bootstrap copy. */
  label?: string;
  /** Fixed fullscreen overlay (dynamic import / bootstrap gate). */
  overlay?: boolean;
  testId?: string;
};

/**
 * Single visual language for auth/bootstrap loading — same bg, type, spinner
 * as `od-loading-shell` so dynamic import → gate → route never look like
 * separate error/loading screens.
 */
export function EmbedLoadingShell({ label, overlay = false, testId }: Props) {
  const className = overlay
    ? 'od-loading-shell od-loading-shell--overlay'
    : 'od-loading-shell';
  return (
    <div className={className} data-testid={testId} role="status" aria-live="polite">
      {label ?? resolveLoadingShellLabel()}
    </div>
  );
}
