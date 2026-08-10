import { useEffect, useRef, useState, type RefObject } from "react";
import type { Project } from "../types";
import { buildProjectCardCover, type ProjectCardCover } from "./projectCardCover";
import {
  projectNeedsCoverFileFetch,
  resolveProjectCoverFile,
  subscribeProjectCoverClear,
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
  const [clearNonce, setClearNonce] = useState(0);

  const [visible, setVisible] = useState(!deferUntilVisible);
  const [override, setOverride] = useState<ProjectCoverFile | null>(null);
  const [fetched, setFetched] = useState(() => !projectNeedsCoverFileFetch(project));

  useEffect(() => {
    return subscribeProjectCoverClear((clearedId) => {
      if (clearedId !== null && clearedId !== projectId) return;
      setClearNonce((value) => value + 1);
    });
  }, [projectId]);

  // New project row, entryFile identity, or explicit cover-cache clear — drop
  // prior override so we re-resolve (deck edits keep the same entryFile).
  useEffect(() => {
    setOverride(null);
    setFetched(!projectNeedsCoverFileFetch(projectRef.current));
  }, [projectId, entryFile, clearNonce]);

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
  }, [allowFilesFallback, projectId, entryFile, visible, fetched, clearNonce]);

  return {
    anchorRef,
    override,
    cover: buildProjectCardCover(project, override),
  };
}
