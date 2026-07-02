import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type StoredExportDownload = {
  token: string;
  url: string;
  filename: string;
  mime: string;
  expiresAt: number;
  filePath: string;
};

type ExportDownloadEntry = StoredExportDownload & {
  projectId: string;
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
  const base = path.basename(name.trim() || 'export');
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180) || 'export';
}

export async function storeExportDownload(options: {
  projectId: string;
  body: Buffer | string;
  filename: string;
  mime: string;
}): Promise<StoredExportDownload> {
  await fs.mkdir(exportDownloadDir, { recursive: true });
  purgeExpiredDownloads();

  const token = crypto.randomBytes(16).toString('hex');
  const filename = safeFilename(options.filename);
  const filePath = path.join(exportDownloadDir, `${token}-${filename}`);
  const body =
    typeof options.body === 'string' ? Buffer.from(options.body, 'utf8') : options.body;
  await fs.writeFile(filePath, body);

  const expiresAt = Date.now() + ticketTtlMs();
  const url = `/api/projects/${encodeURIComponent(options.projectId)}/export/downloads/${token}`;
  const entry: ExportDownloadEntry = {
    token,
    url,
    filename,
    mime: options.mime,
    expiresAt,
    filePath,
    projectId: options.projectId,
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
  await fs.unlink(entry.filePath).catch(() => {});
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
