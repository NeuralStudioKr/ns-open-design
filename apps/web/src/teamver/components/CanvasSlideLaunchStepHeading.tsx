import { useTeamverT } from "../branding/useTeamverT";

type Props = {
  title: string;
  /** Steps 2–3 (prompt, template) are skippable; show a muted badge. */
  optional?: boolean;
  /** Set when a parent control already includes optional in `aria-label`. */
  badgeAriaHidden?: boolean;
  className?: string;
};

/**
 * Step title row for Canvas → Design launch (accordion, compact, studio).
 * Optional steps get a small badge; callers set `aria-label` on triggers when needed.
 */
export function CanvasSlideLaunchStepHeading({
  title,
  optional = false,
  badgeAriaHidden = false,
  className,
}: Props) {
  const t = useTeamverT();
  const rootClass = ["teamver-canvas-slide-launch-step-title-row", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={rootClass}>
      <span className="teamver-canvas-slide-launch-step-title-text">{title}</span>
      {optional ? (
        <span
          className="teamver-canvas-slide-launch-optional-badge"
          {...(badgeAriaHidden ? { "aria-hidden": true } : {})}
        >
          {t("teamver.canvasSlideLaunch.stepOptionalBadge")}
        </span>
      ) : null}
    </span>
  );
}

export function canvasSlideLaunchStepAriaLabel(
  title: string,
  optional: boolean,
  optionalBadge: string,
): string {
  return optional ? `${title} (${optionalBadge})` : title;
}
