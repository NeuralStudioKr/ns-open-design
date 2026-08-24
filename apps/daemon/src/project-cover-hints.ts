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
    const root = path.resolve(projectDir);
    const target = path.resolve(root, coverPath);
    if (target !== root && !target.startsWith(root + path.sep)) return undefined;
    const st = await stat(target);
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
): ResolvedProjectCoverHint | null {
  if (!isSafeProjectRelativePath(entryFile)) return null;
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

function isSafeProjectRelativePath(value: string): boolean {
  if (!value || path.isAbsolute(value) || /^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return false;
  }
  const parts = value.split(/[\\/]+/u);
  return parts.every((part) => part && part !== "." && part !== "..");
}

function isTrustedDeckEntryFile(entryFile: string): boolean {
  const base = entryFile.split(/[\\/]+/u).filter(Boolean).pop() ?? entryFile;
  return /^deck(?:[-_.].*)?\.html?$/i.test(base);
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

/**
 * Lightweight cover hint from sqlite/PG metadata + shallow directory scan
 * (no full /files, no S3 materialize).
 *
 * `metadata.entryFile` may resolve without a local project dir so cold-node
 * cover-hints can hit before lazy materialize — FE then skips `/files`.
 */
export async function resolveProjectCoverHint(
  projectsRoot: string,
  projectId: string,
  project: { metadata?: unknown },
): Promise<ResolvedProjectCoverHint | null> {
  const metadata = (project.metadata ?? {}) as {
    entryFile?: unknown;
    kind?: unknown;
    skipDiscoveryBrief?: unknown;
  };

  const metadataEntry =
    typeof metadata.entryFile === "string" && metadata.entryFile.trim()
      ? metadata.entryFile.trim()
      : "";
  // Unsafe paths (traversal / URL) → null; do not fall through to disk scan
  // with a poisoned entryFile still present in metadata.
  if (metadataEntry && !isSafeProjectRelativePath(metadataEntry)) return null;

  const isDeckProject =
    metadata.kind === "deck" || metadata.skipDiscoveryBrief === true;
  // Canvas→Slide often pins a non-deck HTML entry (index/canvas). Ignore those
  // for deck projects so shallow detectEntryFile / FE /files can prefer deck*.html.
  const ignoreAsCanvasLeak =
    isDeckProject
    && /\.html?$/i.test(metadataEntry)
    && !isTrustedDeckEntryFile(metadataEntry);
  const trustedMetadataEntry =
    metadataEntry && !ignoreAsCanvasLeak ? metadataEntry : "";
  const metadataHint = trustedMetadataEntry
    ? coverHintFromEntry(trustedMetadataEntry, metadata.kind)
    : null;
  if (trustedMetadataEntry && !metadataHint) return null;

  const projectDir = resolveProjectDir(projectsRoot, projectId, project.metadata);
  let dirReady = false;
  try {
    await stat(projectDir);
    dirReady = true;
  } catch {
    dirReady = false;
  }

  if (metadataHint) {
    if (!dirReady) return metadataHint;
    return withCoverVersion(projectDir, metadataHint);
  }

  if (!dirReady) return null;

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
