import type { TeamverBrandingConfig } from "./config";

/** Embed slide-only FE pre-check — daemon still allows up to 200 MB. */
export const EMBED_SLIDE_ATTACH_MAX_BYTES = 50 * 1024 * 1024;

/** Slide-friendly extensions — keep in sync with deploy/teamver/be/app/services/drive_import_policy.py (loop 162). */
const SLIDE_FRIENDLY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
  "pdf",
  "ppt",
  "pptx",
  "odp",
  "key",
  "md",
  "markdown",
  "txt",
  "csv",
  "tsv",
  "json",
  "html",
  "htm",
]);

const BLOCKED_EXTENSIONS = new Set([
  // Keep in sync with drive_import_policy.py _BLOCKED_EXTENSIONS (loop 162).
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "dmg",
  "app",
  "deb",
  "rpm",
  "pkg",
  "ps1",
  "scr",
  "sh",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  "mp3",
  "wav",
  "flac",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
]);

function fileExtension(name: string): string {
  const parts = name.trim().split(".");
  if (parts.length < 2) return "";
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

function mimeMatchesSlideFriendly(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  if (!mime) return false;
  if (mime.startsWith("image/")) return true;
  if (mime === "application/pdf") return true;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return true;
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json" || mime === "text/csv") return true;
  if (mime === "text/html") return true;
  return false;
}

export function shouldApplyEmbedFileAttachPolicy(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): boolean {
  return branding.slideOnlyMvp;
}

export function isEmbedAllowedAttachFile(
  name: string,
  options?: {
    mimeType?: string;
    sizeBytes?: number;
    slideOnlyMvp?: boolean;
  },
): boolean {
  if (!options?.slideOnlyMvp) return true;
  return embedAttachBlockReason(name, options) == null;
}

export function embedAttachBlockReason(
  name: string,
  options?: {
    mimeType?: string;
    sizeBytes?: number;
    slideOnlyMvp?: boolean;
  },
): string | null {
  if (!options?.slideOnlyMvp) return null;

  const trimmed = name.trim();
  if (!trimmed) return "File name is required.";

  const sizeBytes = options.sizeBytes;
  if (typeof sizeBytes === "number" && sizeBytes > EMBED_SLIDE_ATTACH_MAX_BYTES) {
    return "File exceeds the 50 MB embed attach limit.";
  }

  const ext = fileExtension(trimmed);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return "This file type is outside the slide MVP attach policy.";
  }

  if (ext && SLIDE_FRIENDLY_EXTENSIONS.has(ext)) return null;

  const mimeType = options.mimeType?.trim() ?? "";
  if (mimeType && mimeMatchesSlideFriendly(mimeType)) return null;

  return "Only slide-friendly files (images, PDF, PPTX, MD, CSV, JSON, HTML) can be attached in embed mode.";
}
