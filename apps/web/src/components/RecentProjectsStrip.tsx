// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. Overflow kebab (rename/delete) matches DesignsTab
// so home and /projects share the same project actions.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';
import { projectListTrackingKind } from '../teamver/projectListCardCategory';
import { DesignSystemProjectTag, ProjectListCardTag } from '../teamver/components/ProjectListCardTag';
import { useAnalytics } from '../analytics/provider';
import { trackRecentProjectsClick } from '../analytics/events';
import { useT } from '../i18n';
import type { DesignSystemSummary, Project, ProjectDisplayStatus } from '../types';
import { Icon } from './Icon';
import { STATUS_LABEL_KEYS } from './DesignsTab';
import { isDesignSystemProject, isPublishedDesignSystemProject } from './design-system-project';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { useTeamverBranding } from '../teamver/branding/TeamverBrandingProvider';
import { TeamverLatestPublishChip } from '../teamver/components/TeamverLatestPublishChip';
import { ProjectCardHtmlCover } from '../teamver/components/ProjectCardHtmlCover';
import {
  projectOpenOptionsFromPreviewCover,
  type ProjectCoverFile,
} from '../teamver/projectPreviewFile';
import { buildProjectCardCover } from '../teamver/projectCardCover';
import { AuthenticatedProjectFileImage } from './AuthenticatedProjectFileImage';
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
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => Promise<boolean | void> | boolean | void;
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
  onRename,
  onDelete,
  limit = 6,
  workspaceScopeKey,
}: Props) {
  const t = useT();
  const { slideOnlyMvp } = useTeamverBranding();
  const analytics = useAnalytics();
  const renameTitleId = useId();
  const confirmTitleId = useId();
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuOpenUp, setMenuOpenUp] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; original: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
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
  /**
   * Embed: wait for prefetch + preview/html batch warm before mounting
   * ProjectCardHtmlCover — otherwise entryFile cards fire /raw before cache seed (0806-N08).
   */
  const [homeCoversReady, setHomeCoversReady] = useState(() => !isTeamverEmbedMode());
  const showOverflowMenu = Boolean(onRename || onDelete);

  useEffect(() => {
    setCoverByProject({});
    setHomeCoversReady(!isTeamverEmbedMode());
  }, [workspaceScopeKey]);

  useEffect(() => {
    let cancelled = false;
    if (recent.length === 0) {
      setCoverByProject({});
      setHomeCoversReady(true);
      return;
    }

    if (isTeamverEmbedMode()) {
      setHomeCoversReady(false);
    }

    void prefetchHomeProjectCovers(recent).then((entries) => {
      if (cancelled) return;
      setCoverByProject(entries);
      setHomeCoversReady(true);
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

  useEffect(() => {
    if (!menuOpenId) return;
    const onPointerDown = (event: MouseEvent) => {
      const el = menuContainerRef.current;
      if (el && !el.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpenId]);

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

  const trackProjectAction = (
    project: Project,
    element: 'more' | 'rename' | 'delete',
  ) => {
    const projectKind = projectListTrackingKind(project, { slideOnly: slideOnlyMvp });
    trackRecentProjectsClick(analytics.track, {
      page_name: 'home',
      area: 'recent_projects',
      element,
      project_id: project.id,
      ...(projectKind ? { project_kind: projectKind } : {}),
    });
  };

  const openRename = (project: Project) => {
    setRenameTarget({ id: project.id, original: project.name });
    setRenameInput(project.name);
  };

  const commitRename = () => {
    if (!renameTarget) return;
    const trimmed = renameInput.trim();
    if (trimmed && trimmed !== renameTarget.original) {
      onRename?.(renameTarget.id, trimmed);
    }
    setRenameTarget(null);
    setRenameInput('');
  };

  const openDelete = (project: Project) => {
    if (!onDelete) return;
    setConfirmTarget({
      title: t('designs.deleteTitle'),
      message: t('designs.deleteConfirm', { name: project.name }),
      confirmLabel: t('designs.menuDelete'),
      onConfirm: () => onDelete(project.id),
    });
  };

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
            <article
              key={project.id}
              role="listitem"
              className={`recent-projects__card${designSystemProject ? ' is-design-system-project' : ''}`}
              data-project-id={project.id}
            >
              {showOverflowMenu ? (
                <div
                  className="design-card-menu-anchor recent-projects__menu-anchor"
                  ref={menuOpenId === project.id ? menuContainerRef : undefined}
                >
                  <button
                    type="button"
                    className="design-card-more"
                    aria-label={t('designs.menuMore')}
                    aria-haspopup="menu"
                    aria-expanded={menuOpenId === project.id}
                    data-testid={`recent-projects-more-${project.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const openUp = window.innerHeight - rect.bottom < 120;
                      setMenuOpenId((cur) => {
                        const nextId = cur === project.id ? null : project.id;
                        if (nextId === project.id) {
                          setMenuOpenUp(openUp);
                          trackProjectAction(project, 'more');
                        } else {
                          setMenuOpenUp(false);
                        }
                        return nextId;
                      });
                    }}
                  >
                    <Icon name="more-horizontal" size={14} />
                  </button>
                  {menuOpenId === project.id ? (
                    <div
                      className={`design-card-menu${menuOpenUp ? ' design-card-menu--up' : ''}`}
                      role="menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onRename ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            trackProjectAction(project, 'rename');
                            setMenuOpenId(null);
                            openRename(project);
                          }}
                        >
                          <Icon name="pencil" size={12} />
                          <span>{t('designs.menuRename')}</span>
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={() => {
                            trackProjectAction(project, 'delete');
                            setMenuOpenId(null);
                            openDelete(project);
                          }}
                        >
                          <Icon name="close" size={12} />
                          <span>{t('designs.menuDelete')}</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="recent-projects__card-open"
                onClick={() => onOpen(project.id, projectOpenOptionsFromPreviewCover(project, coverOverride))}
                title={project.name}
              >
                <div
                  className={`recent-projects__card-thumb recent-projects__card-thumb-${cover.kind}`}
                  style={cover.style}
                  aria-hidden
                >
                  {(cover.kind === 'image' || cover.kind === 'logo') && cover.filePath ? (
                    <AuthenticatedProjectFileImage
                      projectId={project.id}
                      path={cover.filePath}
                      rev={cover.version}
                      className="recent-projects__thumb-media"
                      trustExists
                      failedFallback={
                        <span className="recent-projects__card-glyph">{cover.initial}</span>
                      }
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
                    homeCoversReady ? (
                      <ProjectCardHtmlCover
                        src={cover.src}
                        deckCoverOnly={slideOnlyMvp || project.metadata?.kind === 'deck'}
                        iframeClassName="recent-projects__thumb-iframe"
                        deckFrameClassName="recent-projects__deck-frame"
                        deckIframeClassName="recent-projects__deck-iframe"
                        deckLoadingClassName="recent-projects__deck-cover-loading"
                      />
                    ) : (
                      <span
                        className="recent-projects__deck-cover-loading"
                        aria-hidden
                      />
                    )
                  ) : (
                    <span className="recent-projects__card-glyph">{cover.initial}</span>
                  )}
                </div>
                <div className="recent-projects__card-meta">
                  <div className="design-card-tag-row">
                    {designSystemProject ? (
                      <DesignSystemProjectTag />
                    ) : (
                      <ProjectListCardTag project={project} />
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
            </article>
          );
        })}
      </div>
      {renameTarget ? (
        <Dialog
          as="form"
          className="modal-rename"
          onClose={() => {
            setRenameTarget(null);
            setRenameInput('');
          }}
          closeOnEscape
          ariaLabelledBy={renameTitleId}
          onSubmit={(e) => {
            e.preventDefault();
            commitRename();
          }}
        >
          <DialogTitle id={renameTitleId}>{t('designs.renameTitle')}</DialogTitle>
          <label>
            {t('designs.renamePrompt', { name: renameTarget.original })}
            <input
              type="text"
              value={renameInput}
              autoFocus
              onChange={(e) => setRenameInput(e.target.value)}
            />
          </label>
          <DialogFooter className="row">
            <button
              type="button"
              onClick={() => {
                setRenameTarget(null);
                setRenameInput('');
              }}
            >
              {t('designs.renameCancel')}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={
                !renameInput.trim() ||
                renameInput.trim() === renameTarget.original
              }
            >
              {t('designs.renameSave')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      {confirmTarget ? (
        <Dialog
          className="modal-confirm"
          role="alertdialog"
          onClose={() => setConfirmTarget(null)}
          closeOnEscape
          ariaLabelledBy={confirmTitleId}
        >
          <DialogTitle id={confirmTitleId}>{confirmTarget.title}</DialogTitle>
          <DialogDescription className="modal-confirm-message">
            {confirmTarget.message}
          </DialogDescription>
          <DialogFooter className="row">
            <button type="button" onClick={() => setConfirmTarget(null)}>
              {t('designs.renameCancel')}
            </button>
            <button
              type="button"
              className="primary danger"
              autoFocus
              onClick={() => {
                const action = confirmTarget.onConfirm;
                setConfirmTarget(null);
                void Promise.resolve(action()).catch(() => {
                  // App-level delete handlers return false on failure; ignore
                  // unexpected rejections so the home strip stays usable.
                });
              }}
            >
              {confirmTarget.confirmLabel}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
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
