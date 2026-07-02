import path from "node:path";
import { stat } from "node:fs/promises";
import { detectEntryFile, resolveProjectDir } from "./projects.js";

export type ResolvedProjectCoverHint = {
  entryFile?: string;
  coverKind?: "html" | "image" | "video" | "logo";
  coverPath?: string;
  coverVersion?: number;
};

async function coverVersionForPath(
  projectDir: string,
  coverPath: string,
): Promise<number | undefined> {
  try {
    const st = await stat(path.join(projectDir, coverPath));
    return Math.round(st.mtimeMs);
  } catch {
    return undefined;
  }
}

async function withCoverVersion(
  projectDir: string,
  hint: ResolvedProjectCoverHint,
): Promise<ResolvedProjectCoverHint> {
  const coverPath = hint.coverPath ?? hint.entryFile;
  if (!coverPath) return hint;
  const coverVersion = await coverVersionForPath(projectDir, coverPath);
  return coverVersion === undefined ? hint : { ...hint, coverVersion };
}

function coverHintFromEntry(
  entryFile: string,
  projectKind: unknown,
): ResolvedProjectCoverHint {
  if (projectKind === "image") {
    return { entryFile, coverKind: "image", coverPath: entryFile };
  }
  if (projectKind === "video") {
    return { entryFile, coverKind: "video", coverPath: entryFile };
  }
  if (/\.html?$/i.test(entryFile)) {
    return { entryFile, coverKind: "html", coverPath: entryFile };
  }
  return { entryFile, coverPath: entryFile };
}

async function detectLogoCoverPath(projectDir: string): Promise<string | null> {
  for (const logoPath of ["assets/logo.svg", "assets/logo.png", "assets/logo.webp"]) {
    try {
      await stat(path.join(projectDir, logoPath));
      return logoPath;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Lightweight cover hint from sqlite metadata + shallow directory scan (no full /files). */
export async function resolveProjectCoverHint(
  projectsRoot: string,
  projectId: string,
  project: { metadata?: unknown },
): Promise<ResolvedProjectCoverHint | null> {
  const metadata = (project.metadata ?? {}) as {
    entryFile?: unknown;
    kind?: unknown;
  };
  const projectDir = resolveProjectDir(projectsRoot, projectId, project.metadata);
  try {
    await stat(projectDir);
  } catch {
    return null;
  }

  if (typeof metadata.entryFile === "string" && metadata.entryFile.trim()) {
    const hint = coverHintFromEntry(metadata.entryFile.trim(), metadata.kind);
    return withCoverVersion(projectDir, hint);
  }

  const entryFile = await detectEntryFile(projectDir);
  if (entryFile) {
    return withCoverVersion(projectDir, { entryFile, coverKind: "html", coverPath: entryFile });
  }

  const logoPath = await detectLogoCoverPath(projectDir);
  if (logoPath) {
    return withCoverVersion(projectDir, { coverKind: "logo", coverPath: logoPath });
  }

  return null;
}
