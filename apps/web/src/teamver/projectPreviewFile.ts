import { isDesignSystemProject } from "../components/design-system-project";
import type { Project, ProjectFile } from "../types";

export type ProjectCoverFile = {
  kind: "html" | "image" | "video" | "logo";
  name: string;
};

export function findDesignSystemLogoFile(files: ProjectFile[]): ProjectFile | null {
  const logoCandidates = files
    .filter((file) => file.type !== "dir")
    .filter((file) => {
      const name = file.path ?? file.name;
      return file.kind === "image" || /\.(svg|png|jpe?g|webp|gif)$/iu.test(name);
    });
  return (
    logoCandidates.find((file) => (file.path ?? file.name).toLowerCase() === "assets/logo.svg") ??
    logoCandidates.find((file) =>
      /(^|\/)(logo|wordmark|brand-mark|brandmark|mark|icon|favicon)[^/]*\.(svg|png|jpe?g|webp|gif)$/iu.test(
        file.path ?? file.name,
      ),
    ) ??
    null
  );
}

/** Latest cover candidate for project cards (HTML/image/video/logo). */
export function pickProjectCoverFile(
  project: Project,
  files: ProjectFile[],
): ProjectCoverFile | null {
  const designSystemProject = isDesignSystemProject(project);
  if (project.metadata?.entryFile && !designSystemProject) return null;

  if (designSystemProject) {
    const logo = findDesignSystemLogoFile(files);
    if (logo) {
      return { kind: "logo", name: logo.path ?? logo.name };
    }
    return null;
  }

  const html =
    files.find((file) => (file.path ?? file.name) === "index.html") ??
    files
      .filter((file) => file.kind === "html")
      .sort((a, b) => b.mtime - a.mtime)[0];
  if (html) {
    return { kind: "html", name: html.path ?? html.name };
  }

  const image = files
    .filter((file) => file.kind === "image")
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (image) {
    return { kind: "image", name: image.path ?? image.name };
  }

  const video = files
    .filter((file) => file.kind === "video")
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (video) {
    return { kind: "video", name: video.path ?? video.name };
  }

  return null;
}

/** Base file name for in-app HTML/deck preview deep-link from project cards. */
export function projectPreviewDeepLinkFileName(
  project: Project,
  cover: ProjectCoverFile | null | undefined,
): string | null {
  if (cover?.kind === "html") {
    return basename(cover.name);
  }
  const entry = project.metadata?.entryFile;
  if (entry && /\.html?$/i.test(entry)) {
    return basename(entry);
  }
  return null;
}

/** `onOpen` options when a project card should land on the HTML preview tab. */
export function projectOpenOptionsFromPreviewCover(
  project: Project,
  cover: ProjectCoverFile | null | undefined,
): { fileName: string } | undefined {
  const fileName = projectPreviewDeepLinkFileName(project, cover);
  return fileName ? { fileName } : undefined;
}

export function projectCoverFilesEqual(
  left: ProjectCoverFile | null | undefined,
  right: ProjectCoverFile | null | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.kind === right.kind && left.name === right.name;
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}
