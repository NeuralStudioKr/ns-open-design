import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode, resolveTeamverMainOrigin } from "../designApiBase";

type Props = {
  /** Optional workspace-scoped Drive folder deep link (future). */
  href?: string;
  title?: string;
};

/**
 * Embed artifact header — opens Teamver Drive instead of OS File Manager
 * (HandoffButton is hidden via hideHandoffButton).
 */
export function TeamverDriveBrowseButton({
  href,
  title = "Open Teamver Drive",
}: Props) {
  if (!isTeamverEmbedMode()) return null;

  const driveUrl = (href?.trim() || `${resolveTeamverMainOrigin()}/drive`).replace(/\/+$/, "");

  return (
    <a
      className="handoff-btn od-tooltip"
      href={driveUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="teamver-drive-browse-button"
      data-tooltip={title}
      aria-label={title}
    >
      <Icon name="folder" size={15} />
      <span>Drive</span>
    </a>
  );
}
