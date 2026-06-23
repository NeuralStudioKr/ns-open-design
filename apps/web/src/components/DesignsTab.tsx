import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from "@open-design/components";
import { projectKindToTracking } from "@open-design/contracts/analytics";
import { useAnalytics } from "../analytics/provider";
import {
  trackPageView,
  trackProjectsListClick,
  trackProjectsListControlsClick,
  trackProjectsMorePopoverClick,
} from "../analytics/events";
import { useT } from "../i18n";
import { deleteLiveArtifact, fetchLiveArtifacts, liveArtifactPreviewUrl } from "../providers/registry";
import type {
	DesignSystemSummary,
	LiveArtifactSummary,
	Project,
	ProjectDisplayStatus,
	SkillSummary,
} from "../types";
import { AnimatePresence } from "motion/react";
import { Icon } from "./Icon";
import { isDesignSystemProject, isPublishedDesignSystemProject } from "./design-system-project";
import { LiveArtifactBadges } from "./LiveArtifactBadges";
import { Toast } from "./Toast";
import { isTeamverEmbedMode } from "../teamver/designApiBase";
import { useTeamverBranding } from "../teamver/branding/TeamverBrandingProvider";
import { DesignsTabProjectThumb } from "../teamver/components/DesignsTabProjectThumb";
import { TeamverLatestPublishChip } from "../teamver/components/TeamverLatestPublishChip";
import { TeamverProjectPreviewChip } from "../teamver/components/TeamverProjectPreviewChip";
import {
  projectOpenOptionsFromPreviewCover,
  projectPreviewDeepLinkFileName,
  projectCoverFilesEqual,
  type ProjectCoverFile,
} from "../teamver/projectPreviewFile";
import { prefetchDesignsTabViewport } from "../teamver/prefetchDesignsTabViewport";
import { PROJECT_LIST_VIEWPORT_BATCH } from "../teamver/projectListLimits";

type SubTab = "recent" | "yours";
type ViewMode = "grid" | "kanban";

type DesignListItem =
	| { type: "project"; project: Project; updatedAt: number; createdAt: number }
	| {
			type: "live-artifact";
			project: Project;
			liveArtifact: LiveArtifactSummary;
			updatedAt: number;
			createdAt: number;
	  };

const DESIGNS_VIEW_STORAGE_KEY = "od:designs:view";

export const STATUS_ORDER = [
	"not_started",
	"running",
	"awaiting_input",
	"succeeded",
	"failed",
	"canceled",
] as const satisfies readonly ProjectDisplayStatus[];

export const STATUS_LABEL_KEYS = {
	not_started: "designs.status.notStarted",
	queued: "designs.status.queued",
	running: "designs.status.running",
	awaiting_input: "designs.status.awaitingInput",
	succeeded: "designs.status.succeeded",
	failed: "designs.status.failed",
	canceled: "designs.status.canceled",
} as const satisfies Record<
	ProjectDisplayStatus,
	Parameters<ReturnType<typeof useT>>[0]
>;

interface Props {
	projects: Project[];
	skills: SkillSummary[];
	designSystems: DesignSystemSummary[];
	onOpen: (id: string, options?: { fileName?: string }) => void;
	onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
	onDelete: (id: string) => Promise<boolean | void> | boolean | void;
	onRename?: (id: string, name: string) => void;
	onNewProject?: () => void;
	/** Embed — Design 앱 비활성 workspace에서 empty-state CTA 비활성. */
	createDisabled?: boolean;
}

export function DesignsTab({
	projects,
	skills,
	designSystems,
	onOpen,
	onOpenLiveArtifact,
	onDelete,
	onRename,
	onNewProject,
	createDisabled = false,
}: Props) {
	const renameTitleId = useId();
	const confirmTitleId = useId();
	const t = useT();
	const teamverEmbed = isTeamverEmbedMode();
	const { slideOnlyMvp } = useTeamverBranding();
	const analytics = useAnalytics();
	// P0 page_view page_name=projects — fire once when the tab mounts so
	// `/projects` landings register even before the user clicks anything.
	// ref-keyed to survive re-renders that flip parent state without
	// remounting DesignsTab, mirroring the pattern in HomeView.
	const projectsPageViewFiredRef = useRef(false);
	useEffect(() => {
		if (projectsPageViewFiredRef.current) return;
		projectsPageViewFiredRef.current = true;
		trackPageView(analytics.track, { page_name: 'projects' });
	}, [analytics.track]);
	const [filter, setFilter] = useState("");
	const [sub, setSub] = useState<SubTab>("recent");
	const [liveArtifactsByProject, setLiveArtifactsByProject] = useState<
		Record<string, LiveArtifactSummary[]>
	>({});
	const [coverOverrides, setCoverOverrides] = useState<Record<string, ProjectCoverFile | null>>({});

	const handleCoverOverride = useCallback((projectId: string, cover: ProjectCoverFile | null) => {
		setCoverOverrides((prev) => {
			if (projectCoverFilesEqual(prev[projectId], cover)) return prev;
			return { ...prev, [projectId]: cover };
		});
	}, []);
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const deleteToastIdRef = useRef(0);
	const [deleteToast, setDeleteToast] = useState<{ id: number; message: string } | null>(null);
	const menuContainerRef = useRef<HTMLDivElement | null>(null);
	const [renameTarget, setRenameTarget] = useState<{ id: string; original: string } | null>(null);
	const [renameInput, setRenameInput] = useState("");
	const [confirmTarget, setConfirmTarget] = useState<{
		title: string;
		message: string;
		confirmLabel: string;
		onConfirm: () => void;
	} | null>(null);
	const [view, setView] = useState<ViewMode>(() => {
		if (typeof window === "undefined") return "grid";
		try {
			const storedView = window.localStorage.getItem(DESIGNS_VIEW_STORAGE_KEY);
			return storedView === "grid" || storedView === "kanban"
				? storedView
				: "grid";
		} catch {
			return "grid";
		}
	});

	useEffect(() => {
		let cancelled = false;
		const projectIds = projects.map((project) => project.id);
		if (projectIds.length === 0 || slideOnlyMvp) {
			setLiveArtifactsByProject({});
			return;
		}

		void Promise.all(
			projectIds.map(
				async (projectId) =>
					[projectId, await fetchLiveArtifacts(projectId)] as const,
			),
		).then((entries) => {
			if (cancelled) return;
			setLiveArtifactsByProject(Object.fromEntries(entries));
		});

		return () => {
			cancelled = true;
		};
	}, [projects, slideOnlyMvp]);

	useEffect(() => {
		if (!menuOpenId) return;
		const onDocClick = (e: MouseEvent) => {
			const el = menuContainerRef.current;
			if (el && el.contains(e.target as Node)) return;
			setMenuOpenId(null);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setMenuOpenId(null);
		};
		window.addEventListener("mousedown", onDocClick);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("mousedown", onDocClick);
			window.removeEventListener("keydown", onKey);
		};
	}, [menuOpenId]);

	useEffect(() => {
		// Drop selected ids that no longer exist
		setSelected((curr) => {
			const valid = new Set(projects.map((p) => p.id));
			let changed = false;
			const next = new Set<string>();
			curr.forEach((id) => {
				if (valid.has(id)) next.add(id);
				else changed = true;
			});
			return changed ? next : curr;
		});
	}, [projects]);

	useEffect(() => {
		try {
			window.localStorage.setItem(DESIGNS_VIEW_STORAGE_KEY, view);
		} catch {}
	}, [view]);

	useEffect(() => {
		if (view === "kanban" && selectMode) exitSelectMode();
	}, [selectMode, view]);

	const filtered = useMemo(() => {
		const q = filter.trim().toLowerCase();
		let list: DesignListItem[] = projects
			.filter(
				(project) =>
					!shouldHideProjectCard(
						project,
						liveArtifactsByProject[project.id] ?? [],
					),
			)
			.map((project) => ({
				type: "project",
				project,
				updatedAt: project.updatedAt,
				createdAt: project.createdAt,
			}));

		const liveItems = projects.flatMap((project) =>
			(liveArtifactsByProject[project.id] ?? []).map((liveArtifact) => ({
				type: "live-artifact" as const,
				project,
				liveArtifact,
				updatedAt: Date.parse(liveArtifact.updatedAt) || project.updatedAt,
				createdAt: Date.parse(liveArtifact.createdAt) || project.createdAt,
			})),
		);

		list = [...list, ...liveItems];

		if (sub === "recent") {
			list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
		}

		if (sub === "yours") {
			list = [...list].sort((a, b) => b.createdAt - a.createdAt);
		}

		if (!q) return list;
		return list.filter((item) => {
			if (item.project.name.toLowerCase().includes(q)) return true;
			return (
				item.type === "live-artifact" &&
				item.liveArtifact.title.toLowerCase().includes(q)
			);
		});
	}, [projects, liveArtifactsByProject, filter, sub]);

	const filteredProjects = useMemo(
		() =>
			filtered.filter(
				(item): item is Extract<DesignListItem, { type: "project" }> =>
					item.type === "project",
			),
		[filtered],
	);

	const viewportPrefetchKey = useMemo(
		() =>
			filteredProjects
				.slice(0, PROJECT_LIST_VIEWPORT_BATCH)
				.map((item) => item.project.id)
				.join("|"),
		[filteredProjects],
	);

	useEffect(() => {
		if (!teamverEmbed || viewportPrefetchKey.length === 0) return;
		if (view !== "grid" && view !== "kanban") return;
		const batch = filteredProjects
			.slice(0, PROJECT_LIST_VIEWPORT_BATCH)
			.map((item) => item.project);
		void prefetchDesignsTabViewport(batch);
	}, [teamverEmbed, view, viewportPrefetchKey, filteredProjects]);

	const skillName = (id: string | null) =>
		skills.find((s) => s.id === id)?.name ?? "";
	const dsName = (id: string | null) =>
		designSystems.find((d) => d.id === id)?.title ?? "";
	const toggleSelected = (id: string) => {
		setSelected((curr) => {
			const next = new Set(curr);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};
	const exitSelectMode = () => {
		setSelectMode(false);
		setSelected(new Set());
	};
	const handleRenameProject = (project: Project) => {
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
		setRenameInput("");
	};
	const cancelRename = () => {
		setRenameTarget(null);
		setRenameInput("");
	};
	const handleDeleteProject = (project: Project) => {
		setConfirmTarget({
			title: t("designs.deleteTitle"),
			message: t("designs.deleteConfirm", { name: project.name }),
			confirmLabel: t("designs.menuDelete"),
			onConfirm: () => onDelete(project.id),
		});
	};
	const handleBatchDelete = () => {
		const ids = Array.from(selected);
		if (ids.length === 0) return;
		setConfirmTarget({
			title: t("designs.deleteTitle"),
			message: t("designs.deleteSelectedConfirm", { n: ids.length }),
			confirmLabel: t("designs.deleteSelected"),
			onConfirm: async () => {
				const results = await Promise.all(
					ids.map(async (id) => {
						try {
							const result = await onDelete(id);
							return result !== false;
						} catch {
							return false;
						}
					}),
				);
				const deleted = results.filter(Boolean).length;
				const failed = results.length - deleted;
				exitSelectMode();
				const message =
					failed > 0
						? t("designs.deleteSelectedPartial", { deleted, failed })
						: t("designs.deleteSelectedSuccess", { n: deleted });
				setDeleteToast({
					id: (deleteToastIdRef.current += 1),
					message,
				});
			},
		});
	};
	const handleDeleteLiveArtifact = async (
		projectId: string,
		artifact: LiveArtifactSummary,
	) => {
		setConfirmTarget({
			title: t("common.delete"),
			message: `${t("common.delete")} "${artifact.title}"?`,
			confirmLabel: t("designs.menuDelete"),
			onConfirm: async () => {
				const ok = await deleteLiveArtifact(projectId, artifact.id);
				if (!ok) return;
				setLiveArtifactsByProject((current) => ({
					...current,
					[projectId]: (current[projectId] ?? []).filter(
						(candidate) => candidate.id !== artifact.id,
					),
				}));
			},
		});
	};

	return (
		<div
			className={`tab-panel${view === "kanban" ? " design-kanban-view" : ""}`}
		>
			<div className="tab-panel-toolbar designs-toolbar">
				<div className="toolbar-left">
					<div
						className="subtab-pill"
						role="group"
						aria-label={t("designs.filterAria")}
					>
						<button
							aria-pressed={sub === "recent"}
							className={sub === "recent" ? "active" : ""}
							onClick={() => {
								trackProjectsListControlsClick(analytics.track, {
									page_name: "projects",
									area: "list_controls",
									element: "recent",
								});
								setSub("recent");
							}}
						>
							{t("designs.subRecent")}
						</button>
						<button
							aria-pressed={sub === "yours"}
							className={sub === "yours" ? "active" : ""}
							onClick={() => {
								trackProjectsListControlsClick(analytics.track, {
									page_name: "projects",
									area: "list_controls",
									element: "your_designs",
								});
								setSub("yours");
							}}
						>
							{t("designs.subYours")}
						</button>
					</div>
				</div>
				<div className="toolbar-right">
					<div className="toolbar-search">
						<span className="search-icon" aria-hidden>
							<Icon name="search" size={13} />
						</span>
						<input
							placeholder={t("designs.searchPlaceholder")}
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							onFocus={() => {
								// P0 ui_click area=list_controls element=search_input.
								// Tracked on focus rather than every keystroke so each
								// engagement counts once.
								trackProjectsListControlsClick(analytics.track, {
									page_name: "projects",
									area: "list_controls",
									element: "search_input",
								});
							}}
						/>
					</div>
					{view === "grid" && selectMode ? (
						<div className="designs-select-bar" role="group">
							<span className="designs-select-count">
								{t("designs.selectedCount", { n: selected.size })}
							</span>
							<button
								type="button"
								className="designs-select-delete"
								disabled={selected.size === 0}
								onClick={handleBatchDelete}
							>
								{t("designs.deleteSelected")}
							</button>
							<button
								type="button"
								className="designs-select-cancel"
								onClick={exitSelectMode}
							>
								{t("designs.cancelSelect")}
							</button>
						</div>
					) : view === "grid" ? (
						<button
							type="button"
							className="designs-select-toggle"
							onClick={() => {
								trackProjectsListControlsClick(analytics.track, {
									page_name: "projects",
									area: "list_controls",
									element: "select",
								});
								setSelectMode(true);
							}}
						>
							<Icon name="check" size={13} />
							<span>{t("designs.selectMode")}</span>
						</button>
					) : null}
					<div
						className="subtab-pill"
						role="group"
						aria-label={t("designs.viewToggleAria")}
					>
						<button
							aria-pressed={view === "grid"}
							className={view === "grid" ? "active" : ""}
							onClick={() => {
								trackProjectsListControlsClick(analytics.track, {
									page_name: "projects",
									area: "list_controls",
									element: "grid_view",
								});
								setView("grid");
							}}
							title={t("designs.viewGrid")}
							data-testid="designs-view-grid"
						>
							<Icon name="grid" size={14} />
						</button>
						<button
							aria-pressed={view === "kanban"}
							className={view === "kanban" ? "active" : ""}
							onClick={() => {
								// Kanban view substitutes for the contract's
								// list_view element.
								trackProjectsListControlsClick(analytics.track, {
									page_name: "projects",
									area: "list_controls",
									element: "list_view",
								});
								setView("kanban");
							}}
							title={t("designs.viewKanban")}
							data-testid="designs-view-kanban"
						>
							<Icon name="kanban" size={14} />
						</button>
					</div>
				</div>
			</div>
			{filtered.length === 0 ? (
				<div className="tab-empty">
					{projects.length === 0 ? (
						<div className="designs-empty-state">
							<h2 className="designs-empty-title">
								{t("designs.emptyNoProjects")}
							</h2>
							{onNewProject ? (
								<button
									type="button"
									className="primary designs-empty-cta"
									disabled={createDisabled}
									onClick={() => {
										if (createDisabled) return;
										trackProjectsListControlsClick(analytics.track, {
											page_name: "projects",
											area: "list_controls",
											element: "create_project",
										});
										onNewProject();
									}}
								>
									<span>{t("entry.navNewProject")}</span>
								</button>
							) : null}
						</div>
					) : (
						t("designs.emptyNoMatch")
					)}
				</div>
			) : view === "grid" ? (
				<div className="design-grid">
					{filtered.map((item) => {
						const p = item.project;
						const skill = skillName(p.skillId);
						const ds = dsName(p.designSystemId);
						if (item.type === "live-artifact") {
							const artifact = item.liveArtifact;
							const title = liveArtifactCardTitle(p, artifact);
							const metaLead = liveArtifactCardMetaLead(p, artifact);
							return (
								<div
									key={`live:${artifact.id}`}
									className={`design-card live-artifact-card status-${artifact.status} refresh-${artifact.refreshStatus}`}
									role="button"
									tabIndex={0}
									onClick={() => onOpenLiveArtifact(p.id, artifact.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											onOpenLiveArtifact(p.id, artifact.id);
										}
									}}
								>
									<button
										type="button"
										className="design-card-close"
										title={t("common.delete")}
										aria-label={`${t("common.delete")} ${artifact.title}`}
										onClick={(e) => {
											e.stopPropagation();
											void handleDeleteLiveArtifact(p.id, artifact);
										}}
									>
										<Icon name="close" size={12} />
									</button>
									<div
										className="design-card-thumb live-artifact-thumb"
										aria-hidden
									>
										<iframe
											className="thumb-iframe"
											src={liveArtifactPreviewUrl(p.id, artifact.id)}
											title=""
											loading="lazy"
											sandbox="allow-scripts"
											tabIndex={-1}
										/>
									</div>
									<div className="design-card-meta-block">
										<ProjectTag category="live-artifact" />
										<LiveArtifactBadges
											className="design-card-badges"
											status={artifact.status}
											refreshStatus={artifact.refreshStatus}
										/>
										<div className="design-card-name" title={title}>
											{title}
										</div>
										<div className="design-card-meta">
											<span className="ds">{metaLead}</span>
											{" · "}
											{artifactStatusLabel(
												artifact.status,
												artifact.refreshStatus,
												t,
											)}
											{" · "}
											{relativeTime(item.updatedAt, t)}
										</div>
									</div>
								</div>
							);
						}

						const liveCount = liveArtifactsByProject[p.id]?.length ?? 0;
						const status = p.status?.value ?? "not_started";
						const previewCover = coverOverrides[p.id] ?? null;
						const previewFileName = projectPreviewDeepLinkFileName(p, previewCover);
						const openProjectCard = () => {
							onOpen(p.id, projectOpenOptionsFromPreviewCover(p, previewCover));
						};
						const isSelected = selected.has(p.id);
						const designSystemProject = isDesignSystemProject(p);
						const publishedDesignSystem = isPublishedDesignSystemProject(p, designSystems);
						return (
							<div
								key={p.id}
								className={`design-card${isSelected ? " is-selected" : ""}${selectMode ? " select-mode" : ""}${designSystemProject ? " is-design-system-project" : ""}`}
								role="button"
								tabIndex={0}
								onClick={() => {
									if (selectMode) {
										toggleSelected(p.id);
									} else {
										// P0 ui_click area=list element=project_card.
										const projectKind = projectKindToTracking(p.metadata?.kind, p.metadata?.videoModel);
										trackProjectsListClick(analytics.track, {
											page_name: "projects",
											area: "list",
											element: "project_card",
											project_id: p.id,
											...(projectKind ? { project_kind: projectKind } : {}),
										});
										openProjectCard();
									}
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										if (selectMode) toggleSelected(p.id);
										else openProjectCard();
									}
								}}
							>
								{selectMode ? (
									<span
										className={`design-card-checkbox${isSelected ? " checked" : ""}`}
										aria-hidden
									>
										{isSelected ? <Icon name="check" size={12} /> : null}
									</span>
								) : (
									<div
										className="design-card-menu-anchor"
										ref={menuOpenId === p.id ? menuContainerRef : undefined}
									>
										<button
											type="button"
											className="design-card-more"
											aria-label={t("designs.menuMore")}
											aria-haspopup="menu"
											aria-expanded={menuOpenId === p.id}
											onClick={(e) => {
												e.stopPropagation();
												setMenuOpenId((cur) => {
													const nextId = cur === p.id ? null : p.id;
													if (nextId === p.id) {
														const projectKind = projectKindToTracking(p.metadata?.kind, p.metadata?.videoModel);
														trackProjectsListClick(analytics.track, {
															page_name: "projects",
															area: "list",
															element: "more",
															project_id: p.id,
															...(projectKind ? { project_kind: projectKind } : {}),
														});
													}
													return nextId;
												});
											}}
										>
											<Icon name="more-horizontal" size={14} />
									</button>
									{menuOpenId === p.id ? (
										<div
											className="design-card-menu"
											role="menu"
											onClick={(e) => e.stopPropagation()}
										>
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													const projectKind = projectKindToTracking(p.metadata?.kind, p.metadata?.videoModel);
													trackProjectsMorePopoverClick(analytics.track, {
														page_name: "projects",
														area: "projects_more_popover",
														element: "rename",
														project_id: p.id,
														...(projectKind ? { project_kind: projectKind } : {}),
													});
													setMenuOpenId(null);
													handleRenameProject(p);
												}}
											>
												<Icon name="pencil" size={12} />
												<span>{t("designs.menuRename")}</span>
											</button>
											<button
												type="button"
												role="menuitem"
												className="danger"
												onClick={() => {
													const projectKind = projectKindToTracking(p.metadata?.kind, p.metadata?.videoModel);
													trackProjectsMorePopoverClick(analytics.track, {
														page_name: "projects",
														area: "projects_more_popover",
														element: "delete",
														project_id: p.id,
														...(projectKind ? { project_kind: projectKind } : {}),
													});
													setMenuOpenId(null);
													handleDeleteProject(p);
												}}
											>
												<Icon name="close" size={12} />
												<span>{t("designs.menuDelete")}</span>
											</button>
										</div>
									) : null}
								</div>
								)}
								<DesignsTabProjectThumb
									project={p}
									liveCount={liveCount}
									liveCountLabel={liveCount > 0 ? t("designs.liveCount", { n: liveCount }) : undefined}
									onCoverOverride={(cover) => handleCoverOverride(p.id, cover)}
								/>
								<div className="design-card-meta-block">
									<div className="design-card-tag-row">
										{designSystemProject ? (
											<DesignSystemProjectTag />
										) : (
											<ProjectTag category={projectCategory(p)} />
										)}
									</div>
									<div className="design-card-name" title={p.name}>
										{p.name}
									</div>
									<div className="design-card-meta">
										<span className="design-card-meta-main">
											{ds ? (
												<span className="ds">{ds}</span>
											) : (
												<span>{t("designs.cardFreeform")}</span>
											)}
											{skill ? ` · ${skill}` : ""}
											{" · "}
											<span
												className={`design-card-status design-card-status-${publishedDesignSystem ? "published" : status}`}
											>
												{publishedDesignSystem ? t("designs.status.published") : statusLabel(status, t)}
											</span>
											{teamverEmbed && !designSystemProject ? (
												<>
													{" · "}
													<TeamverLatestPublishChip projectId={p.id} deferUntilVisible />
													{previewFileName ? (
														<>
															{" · "}
															<TeamverProjectPreviewChip
																projectId={p.id}
																fileName={previewFileName}
																onOpen={onOpen}
															/>
														</>
													) : null}
												</>
											) : null}
										</span>
										{sub === "recent" || sub === "yours" ? (
											<span className="design-card-meta-time">
												{relativeTime(p.updatedAt, t)}
											</span>
										) : null}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="design-kanban-board">
					{STATUS_ORDER.map((status) => {
						const colProjects = filteredProjects.filter(
							(item) =>
								normalizeStatus(item.project.status?.value ?? "not_started") ===
								status,
						);
						return (
							<div key={status} className="design-kanban-col">
								<div className="design-kanban-header">
									<span>{statusLabel(status, t)}</span>
									<span className="design-kanban-count">
										{colProjects.length}
									</span>
								</div>
								<div className="design-kanban-list">
									{colProjects.length === 0 ? (
										<div className="design-kanban-empty">
											{t("designs.kanbanEmptyColumn")}
										</div>
									) : (
										colProjects.map(({ project: p }) => {
											const skill = skillName(p.skillId);
											const ds = dsName(p.designSystemId);
											const designSystemProject = isDesignSystemProject(p);
											const openKanbanCard = () => {
												onOpen(
													p.id,
													projectOpenOptionsFromPreviewCover(
														p,
														coverOverrides[p.id] ?? null,
													),
												);
											};
											return (
												<div
													key={p.id}
													className={`design-kanban-card status-${status}${designSystemProject ? " is-design-system-project" : ""}`}
													role="button"
													tabIndex={0}
													onClick={openKanbanCard}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															openKanbanCard();
														}
													}}
												>
													<button
														className="design-card-close"
														title={t("designs.deleteTitle")}
														aria-label={t("designs.deleteAria", {
															name: p.name,
														})}
														onClick={(e) => {
															e.stopPropagation();
															handleDeleteProject(p);
														}}
													>
														<Icon name="close" size={12} />
													</button>
													<div
														className="design-kanban-card-name"
														title={p.name}
													>
														{p.name}
													</div>
													{designSystemProject ? (
														<div className="design-card-tag-row">
															<DesignSystemProjectTag />
														</div>
													) : null}
													<div className="design-kanban-card-meta">
														{ds ? (
															<span className="ds">{ds}</span>
														) : (
															<span>{t("designs.cardFreeform")}</span>
														)}
														{skill ? ` · ${skill}` : ""}
														{sub === "recent" || sub === "yours"
															? ` · ${relativeTime(p.updatedAt, t)}`
															: ""}
													</div>
												</div>
											);
										})
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
			{renameTarget ? (
				<Dialog
					as="form"
					className="modal-rename"
					onClose={cancelRename}
					closeOnEscape
					ariaLabelledBy={renameTitleId}
					onSubmit={(e) => {
						e.preventDefault();
						commitRename();
					}}
				>
					<DialogTitle id={renameTitleId}>{t("designs.renameTitle")}</DialogTitle>
					<label>
						{t("designs.renamePrompt", { name: renameTarget.original })}
						<input
							type="text"
							value={renameInput}
							autoFocus
							onChange={(e) => setRenameInput(e.target.value)}
						/>
					</label>
					<DialogFooter className="row">
						<button type="button" onClick={cancelRename}>
							{t("designs.renameCancel")}
						</button>
						<button
							type="submit"
							className="primary"
							disabled={
								!renameInput.trim() ||
								renameInput.trim() === renameTarget.original
							}
						>
							{t("designs.renameSave")}
						</button>
					</DialogFooter>
				</Dialog>
			) : null}
			{confirmTarget ? (
				<Dialog
					className="modal-confirm"
					role="alertdialog"
					onClose={() => setConfirmTarget(null)}
					ariaLabelledBy={confirmTitleId}
				>
					<DialogTitle id={confirmTitleId}>{confirmTarget.title}</DialogTitle>
					<DialogDescription className="modal-confirm-message">{confirmTarget.message}</DialogDescription>
					<DialogFooter className="row">
						<button type="button" onClick={() => setConfirmTarget(null)}>
							{t("designs.renameCancel")}
						</button>
						<button
							type="button"
							className="primary danger"
							autoFocus
							onClick={() => {
								const run = confirmTarget.onConfirm;
								setConfirmTarget(null);
								run();
							}}
						>
							{confirmTarget.confirmLabel}
						</button>
					</DialogFooter>
				</Dialog>
			) : null}
			<AnimatePresence>
				{deleteToast ? (
					<Toast
						key={deleteToast.id}
						message={deleteToast.message}
						onDismiss={() => setDeleteToast(null)}
					/>
				) : null}
			</AnimatePresence>
		</div>
	);
}

function normalizeStatus(
	status: ProjectDisplayStatus,
): Exclude<ProjectDisplayStatus, "queued"> {
	return status === "queued" ? "running" : status;
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
	if (diff < min) return t("common.justNow");
	if (diff < hr) return t("common.minutesAgo", { n: Math.floor(diff / min) });
	if (diff < day) return t("common.hoursAgo", { n: Math.floor(diff / hr) });
	if (diff < 7 * day) return t("common.daysAgo", { n: Math.floor(diff / day) });
	return new Date(ts).toLocaleDateString();
}

function artifactStatusLabel(
	status: LiveArtifactSummary["status"],
	refreshStatus: LiveArtifactSummary["refreshStatus"],
	t: ReturnType<typeof useT>,
): string {
	if (status === "archived") return t("designs.statusArchived");
	if (status === "error") return t("designs.statusError");
	if (refreshStatus === "running") return t("designs.statusRefreshing");
	if (refreshStatus === "failed") return t("designs.statusRefreshFailed");
	if (refreshStatus === "succeeded") return t("designs.statusRefreshed");
	return t("designs.statusLive");
}

function shouldHideProjectCard(project: Project, liveArtifacts: LiveArtifactSummary[]): boolean {
  if (liveArtifacts.length === 0) return false;
  return project.skillId === 'live-artifact' && isOrbitProject(project);
}

function liveArtifactCardTitle(project: Project, liveArtifact: LiveArtifactSummary): string {
  return isCollapsedOrbitArtifactProject(project) ? project.name : liveArtifact.title;
}

function liveArtifactCardMetaLead(project: Project, liveArtifact: LiveArtifactSummary): string {
  return isCollapsedOrbitArtifactProject(project) ? liveArtifact.title : project.name;
}

function isCollapsedOrbitArtifactProject(project: Project): boolean {
  return project.skillId === 'live-artifact' && isOrbitProject(project);
}

function isOrbitProject(project: Project): boolean {
  const metadata = project.metadata as { kind?: unknown } | undefined;
  return metadata?.kind === 'orbit';
}


type ProjectCategory = "prototype" | "live-artifact" | "slide" | "media";

function projectCategory(project: Project): ProjectCategory {
	const meta = project.metadata;
	if (meta?.intent === "live-artifact" || project.skillId === "live-artifact") {
		return "live-artifact";
	}
	if (meta?.kind === "deck") return "slide";
	if (meta?.kind === "image" || meta?.kind === "video" || meta?.kind === "audio") {
		return "media";
	}
	return "prototype";
}

function ProjectTag({ category }: { category: ProjectCategory }) {
	const t = useT();
	const label =
		category === "live-artifact"
			? t("designs.tagLiveArtifact")
			: category === "slide"
				? t("designs.tagSlide")
				: category === "media"
					? t("designs.tagMedia")
					: t("designs.tagPrototype");
	return (
		<span className={`design-card-tag tag-${category}`}>{label}</span>
	);
}

function DesignSystemProjectTag() {
	return (
		<span className="design-card-tag tag-design-system">Design System</span>
	);
}
