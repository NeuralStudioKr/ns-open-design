import { Icon } from './Icon';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { EmbedLoadingShell } from './EmbedLoadingShell';
import { resolveLoadingShellLabel } from '../teamver/branding/loadingShellLabel';

interface SpinnerProps {
  size?: number;
  label?: string;
}

export function Spinner({ size = 14, label }: SpinnerProps) {
  return (
    <span className="loading-spinner" role="status" aria-live="polite">
      <Icon name="spinner" size={size} />
      {label ? <span className="loading-spinner-label">{label}</span> : null}
    </span>
  );
}

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

export function Skeleton({ width, height = 14, radius = 6, className }: SkeletonProps) {
  return (
    <span
      className={`skeleton-block${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

/**
 * Card-shaped skeleton tuned for the DesignsTab grid. Renders a thumb area
 * over the row of meta lines so the empty grid feels like content is
 * arriving rather than missing.
 */
export function DesignCardSkeleton() {
  return (
    <div className="design-card design-card-skeleton" aria-hidden>
      <div className="design-card-thumb skeleton-shimmer" />
      <div className="design-card-meta-block">
        <Skeleton height={13} width="65%" />
        <Skeleton height={11} width="45%" />
      </div>
    </div>
  );
}

/**
 * Centered overlay used while bootstrap data loads (agents, skills, design
 * systems, project list). Sits inside a flex/grid parent and grows with it.
 *
 * Embed mode uses the same shell chrome + fixed copy as auth bootstrap so
 * mid-route loaders do not rewrite the label or swap spinner styles.
 */
export function CenteredLoader({
  label,
  fullBleed = false,
}: {
  label?: string;
  /** Full-viewport shell (project deep-link while hydrating). */
  fullBleed?: boolean;
}) {
  if (fullBleed) {
    return <EmbedLoadingShell />;
  }
  const embedTone = isTeamverEmbedMode();
  // Embed: ignore caller labels — one fixed string prevents Entry/Project
  // "Loading…" / "불러오는 중…" / brand-title swaps mid-paint.
  const visibleLabel = embedTone ? resolveLoadingShellLabel() : label;
  return (
    <div className={embedTone ? 'centered-loader centered-loader--embed-tone' : 'centered-loader'}>
      {embedTone ? null : <Spinner size={20} />}
      {visibleLabel ? <span className="centered-loader-label">{visibleLabel}</span> : null}
    </div>
  );
}
