import path from "node:path";
import { stat } from "node:fs/promises";
import { detectEntryFile, resolveProjectDir } from "./projects.js";

export type ResolvedProjectCoverHint = {
  entryFile?: string;
  coverKind?: "html" | "image" | "video" | "logo";
  coverPath?: string;
};

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
  if (typeof metadata.entryFile === "string" && metadata.entryFile.trim()) {
    return coverHintFromEntry(metadata.entryFile.trim(), metadata.kind);
  }

  const projectDir = resolveProjectDir(projectsRoot, projectId, project.metadata);
  try {
    await stat(projectDir);
  } catch {
    return null;
  }

  const entryFile = await detectEntryFile(projectDir);
  if (entryFile) {
    return { entryFile, coverKind: "html", coverPath: entryFile };
  }

  const logoPath = await detectLogoCoverPath(projectDir);
  if (logoPath) {
    return { coverKind: "logo", coverPath: logoPath };
  }

  return null;
}
