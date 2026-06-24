import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { useTeamverT } from "../branding/useTeamverT";
import { isTeamverEmbedMode } from "../designApiBase";
import {
  isTeamverEmbedDesignSurfaceEnabled,
  subscribeTeamverDesignAccessChanged,
} from "../teamverDesignAccess";
import {
  clearLatestPublishSummaryCache,
  fetchLatestPublishSummary,
  type TeamverLatestPublishSummary,
} from "../latestPublishSummary";
import { TEAMVER_PUBLISH_OUTPUTS_CHANGED_EVENT } from "../teamverPublishEvents";

type Props = {
  projectId: string;
  /** Full project list — fetch only when the card scrolls into view. */
  deferUntilVisible?: boolean;
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
export function TeamverLatestPublishChip({ projectId, deferUntilVisible = false }: Props) {
  const t = useTeamverT();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(!deferUntilVisible);
  const [summary, setSummary] = useState<TeamverLatestPublishSummary | null>(null);
  const [designSurfaceEnabled, setDesignSurfaceEnabled] = useState(
    () => isTeamverEmbedDesignSurfaceEnabled(),
  );

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const sync = () => {
      setDesignSurfaceEnabled(isTeamverEmbedDesignSurfaceEnabled());
    };
    sync();
    return subscribeTeamverDesignAccessChanged(sync);
  }, []);

  useEffect(() => {
    if (!deferUntilVisible) return;
    const node = anchorRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [deferUntilVisible, projectId]);

  const refresh = useCallback(async () => {
    if (!isTeamverEmbedMode()) return;
    const next = await fetchLatestPublishSummary(projectId);
    setSummary(next);
  }, [projectId]);

  useEffect(() => {
    if (!visible || !isTeamverEmbedMode() || !designSurfaceEnabled) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    void fetchLatestPublishSummary(projectId).then((next) => {
      if (!cancelled) setSummary(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, visible, designSurfaceEnabled]);

  useEffect(() => {
    if (!isTeamverEmbedMode() || !designSurfaceEnabled) return;
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
  }, [projectId, refresh, designSurfaceEnabled]);

  // loop 347 — workspace switch is handled centrally by App.tsx:
  // `subscribeTeamverWorkspaceChanged` → `clearTeamverEmbedListCaches()` +
  // `setProjects([])` causes every chip to unmount before the new project
  // list mounts fresh chips against a warm batch cache. A chip-level
  // listener (loop 344) fires while the component is already on its way to
  // unmount, doing redundant work and risking "can't update unmounted
  // component" warnings. We rely on the centralized clear instead.

  if (!isTeamverEmbedMode() || !designSurfaceEnabled) {
    return null;
  }

  if (!visible) {
    return <span ref={anchorRef} className="teamver-latest-publish-chip-anchor" aria-hidden />;
  }

  if (!summary) {
    return <span ref={anchorRef} className="teamver-latest-publish-chip-anchor" aria-hidden />;
  }

  return (
    <span ref={anchorRef} className="teamver-latest-publish-chip-anchor">
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
    </span>
  );
}
