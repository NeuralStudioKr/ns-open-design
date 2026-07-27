import type { IconName } from "../components/Icon";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "avif",
]);

const SLIDE_EXTENSIONS = new Set(["ppt", "pptx", "odp", "key"]);

const DATA_EXTENSIONS = new Set(["xls", "xlsx", "csv", "tsv", "json", "xml"]);

function fileExtension(name: string): string {
  const parts = name.trim().split(".");
  if (parts.length < 2) return "";
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

export function isDriveImageAsset(name: string, mimeType?: string): boolean {
  const mime = mimeType?.trim().toLowerCase() ?? "";
  if (mime.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(fileExtension(name));
}

export function driveImportAssetIconName(name: string, mimeType?: string): IconName {
  if (isDriveImageAsset(name, mimeType)) return "image";
  const ext = fileExtension(name);
  if (SLIDE_EXTENSIONS.has(ext)) return "present";
  if (DATA_EXTENSIONS.has(ext)) return "file-code";
  return "file";
}

export function formatDriveFileSize(sizeBytes?: number): string | null {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(sizeBytes < 10_240 ? 1 : 0)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type DriveDisplayFileNameParts = {
  full: string;
  stem: string;
  /** Includes the leading dot when present (e.g. `.pdf`). */
  extension: string;
};

/** Split a drive asset name so the extension can stay visible while the stem truncates. */
export function splitDriveDisplayFileName(name: string): DriveDisplayFileNameParts {
  const full = name.trim() ? name : String(name ?? "");
  const lastDot = full.lastIndexOf(".");
  if (lastDot <= 0 || lastDot >= full.length - 1) {
    return { full, stem: full, extension: "" };
  }
  return {
    full,
    stem: full.slice(0, lastDot),
    extension: full.slice(lastDot),
  };
}
