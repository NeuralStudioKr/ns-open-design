import { useEffect, useRef, useState, type RefObject } from "react";
import type { Project } from "../types";
import { buildProjectCardCover, type ProjectCardCover } from "./projectCardCover";
import {
  projectNeedsCoverFileFetch,
  resolveProjectCoverFile,
} from "./projectCoverLoader";
import type { ProjectCoverFile } from "./projectPreviewFile";

type Options = {
  deferUntilVisible?: boolean;
  /**
   * Visible cards default to `/files` after cover-hints miss.
   * Do not inherit list-surface hints-only here — that path is for warm/prefetch
   * only and previously blanked DesignsTab thumbs when hints were empty.
   */
  allowFilesFallback?: boolean;
};

type LazyProjectCoverState = {
  anchorRef: RefObject<HTMLDivElement>;
  override: ProjectCoverFile | null;
  cover: ProjectCardCover;
};

/** Fetch project card cover override; lazy when `deferUntilVisible` (full project list). */
export function useLazyProjectCover(
  project: Project,
  options: Options = {},
): LazyProjectCoverState {
  const { deferUntilVisible = true, allowFilesFallback = true } = options;
  const anchorRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  const projectId = project.id;
  const entryFile = project.metadata?.entryFile ?? "";

  const [visible, setVisible] = useState(!deferUntilVisible);
  const [override, setOverride] = useState<ProjectCoverFile | null>(null);
  const [fetched, setFetched] = useState(() => !projectNeedsCoverFileFetch(project));

  // New project row (or entryFile identity) — drop prior override so we re-resolve.
  useEffect(() => {
    setOverride(null);
    setFetched(!projectNeedsCoverFileFetch(projectRef.current));
  }, [projectId, entryFile]);

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
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [deferUntilVisible, projectId]);

  useEffect(() => {
    if (!visible || fetched) return;
    const current = projectRef.current;
    if (!projectNeedsCoverFileFetch(current)) {
      setFetched(true);
      return;
    }
    let cancelled = false;
    void resolveProjectCoverFile(current, { allowFilesFallback }).then((next) => {
      if (cancelled) return;
      setOverride(next);
      setFetched(true);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally omit full `project` — list polls create new object identities
    // and would cancel+restart /files cover resolve for every card.
  }, [allowFilesFallback, projectId, entryFile, visible, fetched]);

  return {
    anchorRef,
    override,
    cover: buildProjectCardCover(project, override),
  };
}
