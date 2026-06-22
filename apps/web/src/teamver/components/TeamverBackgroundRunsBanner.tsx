import { Icon } from "../../components/Icon";
import type { PetTaskSummary } from "../../components/pet/PetOverlay";
import { useT } from "../../i18n";

type Props = {
  summaries: PetTaskSummary[];
  onOpenProject: (projectId: string) => void;
};

function statusLabelKey(status: PetTaskSummary["status"]): "teamver.backgroundRuns.running" | "teamver.backgroundRuns.queued" {
  return status === "running"
    ? "teamver.backgroundRuns.running"
    : "teamver.backgroundRuns.queued";
}

/**
 * Embed home/projects — surfaces active runs after leaving a project workspace
 * (pet overlay is often disabled in Teamver embed).
 */
export function TeamverBackgroundRunsBanner({ summaries, onOpenProject }: Props) {
  const t = useT();
  if (summaries.length === 0) return null;

  const primary = summaries[0]!;
  const extraCount = summaries.length - 1;

  return (
    <div
      className="teamver-background-runs"
      role="status"
      aria-live="polite"
      data-testid="teamver-background-runs-banner"
    >
      <span className="teamver-background-runs__pulse" aria-hidden />
      <div className="teamver-background-runs__copy">
        <span className="teamver-background-runs__title">
          {extraCount > 0
            ? t("teamver.backgroundRuns.titleMany", { n: summaries.length })
            : t("teamver.backgroundRuns.titleOne")}
        </span>
        <span className="teamver-background-runs__detail">
          {t(statusLabelKey(primary.status))}
          {" · "}
          <span className="teamver-background-runs__project">{primary.projectName}</span>
          {primary.count > 1 ? ` (${primary.count})` : ""}
          {extraCount > 0 ? ` ${t("teamver.backgroundRuns.andMore", { n: extraCount })}` : ""}
        </span>
      </div>
      <button
        type="button"
        className="teamver-background-runs__open"
        onClick={() => onOpenProject(primary.projectId)}
        data-testid="teamver-background-runs-open"
      >
        <span>{t("teamver.backgroundRuns.open")}</span>
        <Icon name="chevron-right" size={13} aria-hidden />
      </button>
    </div>
  );
}
