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
  const { deferUntilVisible = true } = options;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!deferUntilVisible);
  const [override, setOverride] = useState<ProjectCoverFile | null>(null);
  const [fetched, setFetched] = useState(() => !projectNeedsCoverFileFetch(project));

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
  }, [deferUntilVisible, project.id]);

  useEffect(() => {
    if (!visible || fetched) return;
    if (!projectNeedsCoverFileFetch(project)) {
      setFetched(true);
      return;
    }
    let cancelled = false;
    void resolveProjectCoverFile(project).then((next) => {
      if (cancelled) return;
      setOverride(next);
      setFetched(true);
    });
    return () => {
      cancelled = true;
    };
  }, [project, visible, fetched]);

  return {
    anchorRef,
    override,
    cover: buildProjectCardCover(project, override),
  };
}
