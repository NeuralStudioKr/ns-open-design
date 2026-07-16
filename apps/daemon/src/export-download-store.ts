import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type StoredExportDownload = {
  token: string;
  url: string;
  deliveryMode: 'stream' | 'redirect';
  filename: string;
  mime: string;
  bytes: number;
  expiresAt: number;
  filePath: string;
  offloadKey?: string;
  offloadStatus?: string;
  offloadReason?: string;
};

type ExportDownloadEntry = StoredExportDownload & {
  projectId: string;
  // `ownsFile: false` means the ticket points at a file managed by the
  // export cache (§20.5). `completeExportDownload` MUST NOT unlink such
  // files — the cache owns eviction.
  ownsFile: boolean;
};

const exportDownloadDir = path.join(
  os.tmpdir(),
  'od-export-downloads',
);

const downloads = new Map<string, ExportDownloadEntry>();
const inFlightDownloads = new Set<string>();

const EXPORT_DOWNLOAD_TOKEN_RE = /^[a-f0-9]{32}$/i;

function ticketTtlMs(): number {
  const parsed = Number(process.env.OD_EXPORT_TICKET_TTL_SEC ?? '');
  if (Number.isFinite(parsed) && parsed >= 30) return Math.floor(parsed) * 1000;
  return 300_000;
}

function safeFilename(name: string): string {
  const fallback = 'teamver_design';
  const base = path.basename(name.trim() || fallback);
  const cleaned = base
    .replace(/[/\\?%*:|"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .trim()
    .slice(0, 180);
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) return fallback;
  return cleaned;
}

export async function storeExportDownload(options: {
  projectId: string;
  /**
   * When provided, the ticket references an existing file (typically an
   * export-cache-owned path) and does NOT copy bytes into the ticket
   * directory. The file lifecycle stays with its owner.
   */
  sourceFilePath?: string;
  bytes?: number;
  /** Body is required when `sourceFilePath` is absent. */
  body?: Buffer | string;
  filename: string;
  mime: string;
  deliveryMode?: 'stream' | 'redirect';
  offloadKey?: string;
  offloadStatus?: string;
  offloadReason?: string;
}): Promise<StoredExportDownload> {
  const token = crypto.randomBytes(16).toString('hex');
  const filename = safeFilename(options.filename);
  const expiresAt = Date.now() + ticketTtlMs();
  const url = `/api/projects/${encodeURIComponent(options.projectId)}/export/downloads/${token}`;

  let filePath: string;
  let ownsFile: boolean;
  let bytes: number;

  if (options.sourceFilePath) {
    filePath = options.sourceFilePath;
    ownsFile = false;
    bytes =
      Number.isFinite(options.bytes) && options.bytes !== undefined && options.bytes >= 0
        ? Math.floor(options.bytes)
        : (await fs.stat(filePath)).size;
    purgeExpiredDownloads();
  } else {
    if (!options.body) {
      throw new Error('storeExportDownload requires either body or sourceFilePath');
    }
    await fs.mkdir(exportDownloadDir, { recursive: true });
    purgeExpiredDownloads();
    filePath = path.join(exportDownloadDir, `${token}-${filename}`);
    const body =
      typeof options.body === 'string' ? Buffer.from(options.body, 'utf8') : options.body;
    bytes = body.byteLength;
    await fs.writeFile(filePath, body);
    ownsFile = true;
  }

  const entry: ExportDownloadEntry = {
    token,
    url,
    deliveryMode: options.deliveryMode === 'redirect' && options.offloadKey ? 'redirect' : 'stream',
    filename,
    mime: options.mime,
    bytes,
    expiresAt,
    filePath,
    projectId: options.projectId,
    ownsFile,
    ...(options.offloadKey ? { offloadKey: options.offloadKey } : {}),
    ...(options.offloadStatus ? { offloadStatus: options.offloadStatus } : {}),
    ...(options.offloadReason ? { offloadReason: options.offloadReason } : {}),
  };
  downloads.set(token, entry);
  return entry;
}

function normalizedExportToken(token: string): string | null {
  const trimmed = token.trim();
  return EXPORT_DOWNLOAD_TOKEN_RE.test(trimmed) ? trimmed : null;
}

export function resolveExportDownload(
  projectId: string,
  token: string,
): ExportDownloadEntry | null {
  purgeExpiredDownloads();
  const normalized = normalizedExportToken(token);
  if (!normalized) return null;
  const entry = downloads.get(normalized);
  if (!entry) return null;
  if (entry.projectId !== projectId) return null;
  if (entry.expiresAt <= Date.now()) {
    void removeExportDownload(normalized);
    return null;
  }
  return entry;
}

/** Reserve a ticket for streaming — blocks concurrent downloads of the same token. */
export function claimExportDownload(
  projectId: string,
  token: string,
): ExportDownloadEntry | null {
  purgeExpiredDownloads();
  const normalized = normalizedExportToken(token);
  if (!normalized || inFlightDownloads.has(normalized)) return null;
  const entry = resolveExportDownload(projectId, normalized);
  if (!entry) return null;
  inFlightDownloads.add(normalized);
  return entry;
}

/** Drop the in-flight guard without deleting the ticket (failed/aborted download). */
export function releaseExportDownloadClaim(token: string): void {
  const normalized = normalizedExportToken(token);
  if (normalized) inFlightDownloads.delete(normalized);
}

/** Consume ticket + delete temp file after a successful download stream. */
export async function completeExportDownload(token: string): Promise<void> {
  const normalized = normalizedExportToken(token);
  if (normalized) inFlightDownloads.delete(normalized);
  if (normalized) await removeExportDownload(normalized);
}

export async function removeExportDownload(token: string): Promise<void> {
  const entry = downloads.get(token);
  downloads.delete(token);
  if (!entry) return;
  if (entry.ownsFile) {
    await fs.unlink(entry.filePath).catch(() => {});
  }
}

export function wantsTicketDelivery(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as { delivery?: unknown }).delivery === 'ticket';
}

function purgeExpiredDownloads(): void {
  const now = Date.now();
  for (const [token, entry] of downloads) {
    if (entry.expiresAt <= now) {
      void removeExportDownload(token);
    }
  }
}

/** @internal vitest */
export async function clearExportDownloadsForTests(): Promise<void> {
  inFlightDownloads.clear();
  for (const token of [...downloads.keys()]) {
    await removeExportDownload(token);
  }
}
