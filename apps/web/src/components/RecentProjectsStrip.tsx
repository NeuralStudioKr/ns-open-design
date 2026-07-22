// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { DesignSystemSummary, Project, ProjectDisplayStatus } from '../types';
import { Icon } from './Icon';
import { STATUS_LABEL_KEYS } from './DesignsTab';
import { isDesignSystemProject, isPublishedDesignSystemProject } from './design-system-project';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { TeamverLatestPublishChip } from '../teamver/components/TeamverLatestPublishChip';
import { ProjectCardHtmlCover } from '../teamver/components/ProjectCardHtmlCover';
import {
  projectOpenOptionsFromPreviewCover,
  type ProjectCoverFile,
} from '../teamver/projectPreviewFile';
import { buildProjectCardCover } from '../teamver/projectCardCover';
import { prefetchHomeProjectCovers } from '../teamver/prefetchHomeProjectCovers';
import { homePublishChipPrefetchIds } from '../teamver/embedPublishChipProjects';
import { prefetchLatestPublishSummaries } from '../teamver/latestPublishSummary';
import type { PetTaskSummary } from './pet/PetOverlay';
import {
  buildActiveRunStatusByProjectId,
  hasProjectArtifactSignal,
  resolveRecentProjectDisplayStatus,
} from '../teamver/recentProjectDisplayStatus';

interface Props {
  projects: Project[];
  /** Live active runs from `/api/runs` — overrides stale registry status on cards. */
  activeRunSummaries?: PetTaskSummary[];
  /** Used only to show a "Published" status for design-system projects whose
   *  backing system is published (independent of the project's run status). */
  designSystems?: DesignSystemSummary[];
  /** Retained for call-site compatibility; the strip skips rendering
   *  while the list is loading so we never need a loading state. */
  loading?: boolean;
  onOpen: (id: string, options?: { fileName?: string }) => void;
  onViewAll: () => void;
  limit?: number;
  /** Embed: invalidate cached covers when the active workspace changes. */
  workspaceScopeKey?: string | null;
}

const EMPTY_DESIGN_SYSTEMS: DesignSystemSummary[] = [];

export function RecentProjectsStrip({
  projects,
  activeRunSummaries = [],
  designSystems = EMPTY_DESIGN_SYSTEMS,
  loading = false,
  onOpen,
  onViewAll,
  limit = 6,
  workspaceScopeKey,
}: Props) {
  const t = useT();
  const activeRunStatusByProjectId = useMemo(
    () => buildActiveRunStatusByProjectId(activeRunSummaries),
    [activeRunSummaries],
  );
  const recent = useMemo(
    () => [...projects]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit),
    [projects, limit],
  );
  const [coverByProject, setCoverByProject] = useState<
    Record<string, ProjectCoverFile | null>
  >({});

  useEffect(() => {
    setCoverByProject({});
  }, [workspaceScopeKey]);

  useEffect(() => {
    let cancelled = false;
    if (recent.length === 0) {
      setCoverByProject({});
      return;
    }

    void prefetchHomeProjectCovers(recent).then((entries) => {
      if (cancelled) return;
      setCoverByProject(entries);
    });

    return () => {
      cancelled = true;
    };
  }, [recent, workspaceScopeKey]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    let cancelled = false;
    const ids = homePublishChipPrefetchIds(recent);
    if (ids.length === 0) return;
    void prefetchLatestPublishSummaries(ids).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [recent]);

  // First-run home shouldn't reserve space for an empty "Recent
  // projects" rail — the dashed empty box just adds visual noise
  // above the plugin gallery. While loading, show a compact skeleton
  // instead of popping in after the fetch settles.
  if (loading && recent.length === 0) {
    return (
      <section
        className="recent-projects recent-projects--loading"
        data-testid="recent-projects-skeleton"
        aria-busy="true"
        aria-label={t('recentProjects.title')}
      >
        <header className="recent-projects__head">
          <h2 className="recent-projects__title">{t('recentProjects.title')}</h2>
        </header>
        <div className="recent-projects__row">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="recent-projects__card recent-projects__card--skeleton"
              aria-hidden
            />
          ))}
        </div>
      </section>
    );
  }

  if (recent.length === 0) {
    return null;
  }

  return (
    <section className="recent-projects" data-testid="recent-projects-strip">
      <header className="recent-projects__head">
        <h2 className="recent-projects__title">{t('recentProjects.title')}</h2>
        <button
          type="button"
          className="recent-projects__view-all"
          onClick={onViewAll}
          data-testid="recent-projects-view-all"
        >
          <span>{t('recentProjects.viewAll')}</span>
          <Icon name="chevron-right" size={12} />
        </button>
      </header>
      <div className="recent-projects__row" role="list">
        {recent.map((project) => {
          const coverOverride = coverByProject[project.id] ?? null;
          const cover = buildProjectCardCover(project, coverOverride);
          const designSystemProject = isDesignSystemProject(project);
          const status: ProjectDisplayStatus = resolveRecentProjectDisplayStatus(
            project.id,
            project.status?.value,
            activeRunStatusByProjectId,
            { hasArtifactSignal: hasProjectArtifactSignal(project, coverOverride) },
          );
          const publishedDesignSystem = isPublishedDesignSystemProject(project, designSystems);
          const isActive =
            !publishedDesignSystem &&
            (status === 'running' || status === 'queued' || status === 'awaiting_input');
          return (
            <button
              key={project.id}
              type="button"
              role="listitem"
              className={`recent-projects__card${designSystemProject ? ' is-design-system-project' : ''}`}
              onClick={() => onOpen(project.id, projectOpenOptionsFromPreviewCover(project, coverOverride))}
              title={project.name}
              data-project-id={project.id}
            >
              <div
                className={`recent-projects__card-thumb recent-projects__card-thumb-${cover.kind}`}
                style={cover.style}
                aria-hidden
              >
                {(cover.kind === 'image' || cover.kind === 'logo') && cover.src ? (
                  <img
                    className="recent-projects__thumb-media"
                    src={cover.src}
                    alt=""
                    loading="lazy"
                  />
                ) : cover.kind === 'video' && cover.src ? (
                  <video
                    className="recent-projects__thumb-media"
                    src={cover.src}
                    muted
                    preload="metadata"
                    playsInline
                  />
                ) : cover.kind === 'html' && cover.src ? (
                  <ProjectCardHtmlCover
                    src={cover.src}
                    deckCoverOnly={project.metadata?.kind === 'deck'}
                    iframeClassName="recent-projects__thumb-iframe"
                    deckFrameClassName="recent-projects__deck-frame"
                    deckIframeClassName="recent-projects__deck-iframe"
                    deckLoadingClassName="recent-projects__deck-cover-loading"
                  />
                ) : (
                  <span className="recent-projects__card-glyph">{cover.initial}</span>
                )}
              </div>
              <div className="recent-projects__card-meta">
                <div className="design-card-tag-row">
                  {designSystemProject ? (
                    <DesignSystemProjectTag />
                  ) : (
                    <ProjectTag category={projectCategory(project)} />
                  )}
                </div>
                <div className="recent-projects__card-name">{project.name}</div>
                <div className="recent-projects__card-footer">
                  <div className="recent-projects__card-time">
                    <span
                      className={`recent-projects__card-status recent-projects__card-status-${publishedDesignSystem ? 'published' : status}`}
                    >
                      {isActive ? (
                        <span className="recent-projects__card-status-dot" aria-hidden />
                      ) : null}
                      {publishedDesignSystem ? t('designs.status.published') : statusLabel(status, t)}
                    </span>
                    <span className="recent-projects__card-sep" aria-hidden>·</span>
                    <span className="recent-projects__card-updated">
                      {relativeTime(project.updatedAt, t)}
                    </span>
                  </div>
                  {isTeamverEmbedMode() && !designSystemProject ? (
                    <div className="recent-projects__card-drive">
                      <TeamverLatestPublishChip projectId={project.id} />
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function statusLabel(
  status: ProjectDisplayStatus,
  t: ReturnType<typeof useT>,
): string {
  return t(STATUS_LABEL_KEYS[status]);
}

function relativeTime(ts: number, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}

type ProjectCategory = 'prototype' | 'live-artifact' | 'slide' | 'media';

function projectCategory(project: Project): ProjectCategory {
  const meta = project.metadata;
  if (meta?.intent === 'live-artifact' || project.skillId === 'live-artifact') {
    return 'live-artifact';
  }
  if (meta?.kind === 'deck') return 'slide';
  if (meta?.kind === 'image' || meta?.kind === 'video' || meta?.kind === 'audio') {
    return 'media';
  }
  return 'prototype';
}

function ProjectTag({ category }: { category: ProjectCategory }) {
  const t = useT();
  const label =
    category === 'live-artifact'
      ? t('designs.tagLiveArtifact')
      : category === 'slide'
        ? t('designs.tagSlide')
        : category === 'media'
          ? t('designs.tagMedia')
          : t('designs.tagPrototype');
  return <span className={`design-card-tag tag-${category}`}>{label}</span>;
}

function DesignSystemProjectTag() {
  return <span className="design-card-tag tag-design-system">Design System</span>;
}
