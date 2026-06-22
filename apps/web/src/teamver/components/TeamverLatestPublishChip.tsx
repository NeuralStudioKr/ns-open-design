import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { useT } from "../../i18n";
import { isTeamverEmbedMode } from "../designApiBase";
import {
  clearLatestPublishSummaryCache,
  fetchLatestPublishSummary,
  type TeamverLatestPublishSummary,
} from "../latestPublishSummary";
import { TEAMVER_PUBLISH_OUTPUTS_CHANGED_EVENT } from "../teamverPublishEvents";

type Props = {
  projectId: string;
};

const KIND_LABELS: Record<string, string> = {
  html: "HTML",
  zip: "ZIP",
  pdf: "PDF",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind.toLowerCase()] ?? kind.toUpperCase();
}

/** Embed project cards — latest Drive publish deep link (vN). */
export function TeamverLatestPublishChip({ projectId }: Props) {
  const t = useT();
  const [summary, setSummary] = useState<TeamverLatestPublishSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!isTeamverEmbedMode()) return;
    const next = await fetchLatestPublishSummary(projectId);
    setSummary(next);
  }, [projectId]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    let cancelled = false;
    void fetchLatestPublishSummary(projectId).then((next) => {
      if (!cancelled) setSummary(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const handlePublishChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId && detail.projectId !== projectId) return;
      clearLatestPublishSummaryCache(projectId);
      void refresh();
    };
    window.addEventListener(TEAMVER_PUBLISH_OUTPUTS_CHANGED_EVENT, handlePublishChanged);
    return () => {
      window.removeEventListener(TEAMVER_PUBLISH_OUTPUTS_CHANGED_EVENT, handlePublishChanged);
    };
  }, [projectId, refresh]);

  if (!summary) return null;

  return (
    <a
      href={summary.driveUrl}
      className="teamver-latest-publish-chip"
      target="_blank"
      rel="noopener noreferrer"
      title={t("teamver.publish.chipTitle", {
        version: summary.version,
        kind: kindLabel(summary.kind),
        filename: summary.filename,
      })}
      data-testid={`teamver-publish-chip-${projectId}`}
      onClick={(event) => event.stopPropagation()}
    >
      <Icon name="external-link" size={11} aria-hidden />
      <span>{t("teamver.publish.chipLabel", { version: summary.version })}</span>
    </a>
  );
}
