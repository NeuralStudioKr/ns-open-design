import {
  isEmbedLoadingSurface,
  resolveLoadingShellLabel,
  TEAMVER_EMBED_LOADING_BG,
  TEAMVER_EMBED_LOADING_TEXT,
} from '../teamver/branding/loadingShellLabel';

type Props = {
  /** Override label; embed bootstrap ignores overrides to prevent copy flicker. */
  label?: string;
  /** Fixed fullscreen overlay (dynamic import / bootstrap gate). */
  overlay?: boolean;
  testId?: string;
};

/**
 * Single visual language for auth/bootstrap loading — warm cream bg + one
 * fixed label so dynamic import → gate → route never flash white or rewrite copy.
 */
export function EmbedLoadingShell({ label, overlay = false, testId }: Props) {
  const embed = isEmbedLoadingSurface();
  const className = [
    'od-loading-shell',
    embed ? 'od-loading-shell--teamver' : '',
    overlay ? 'od-loading-shell--overlay' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Inline bg beats FOUC when CSS chunks lag behind the first React paint.
  const style = embed
    ? {
        backgroundColor: TEAMVER_EMBED_LOADING_BG,
        color: TEAMVER_EMBED_LOADING_TEXT,
      }
    : undefined;

  return (
    <div
      className={className}
      style={style}
      data-testid={testId}
      role="status"
      aria-live="off"
      aria-busy="true"
    >
      {embed ? resolveLoadingShellLabel() : (label ?? resolveLoadingShellLabel())}
    </div>
  );
}
