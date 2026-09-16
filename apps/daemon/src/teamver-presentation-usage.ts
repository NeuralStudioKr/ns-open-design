import type { Request } from 'express';

import { readTeamverIdentityFromRequest, teamverDesignApiBaseUrl } from './teamver-project-access.js';

function teamverInternalApiKey(): string | null {
  const key = (process.env.TEAMVER_INTERNAL_API_KEY ?? '').trim();
  return key || null;
}

export function presentationArtifactId(args: {
  projectId: string;
  fileName: string;
  artifactManifest?: unknown;
}): string | null {
  if (!isPresentationArtifact(args.fileName, args.artifactManifest)) return null;
  const fromManifest = manifestIdentifier(args.artifactManifest);
  if (fromManifest) return fromManifest;
  const name = args.fileName.trim();
  const projectId = args.projectId.trim();
  if (!projectId || !name) return null;
  return `${projectId}:${name}`;
}

function presentationFileBaseName(fileName: string): string {
  const name = fileName.trim().toLowerCase().replace(/\\/g, '/');
  const slash = name.lastIndexOf('/');
  return slash >= 0 ? name.slice(slash + 1) : name;
}

/** deck.html 또는 manifest kind=deck 만. `slides`/`pitch` 부분일치는 노트·초안을 완료로 센다. */
export function isPresentationArtifact(fileName: string, artifactManifest?: unknown): boolean {
  if (manifestKind(artifactManifest) === 'deck') return true;
  return presentationFileBaseName(fileName) === 'deck.html';
}

function manifestKind(artifactManifest: unknown): string {
  if (!artifactManifest || typeof artifactManifest !== 'object') return '';
  const kind = (artifactManifest as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind.trim().toLowerCase() : '';
}

function manifestIdentifier(artifactManifest: unknown): string | null {
  if (!artifactManifest || typeof artifactManifest !== 'object') return null;
  const metadata = (artifactManifest as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const identifier = (metadata as { identifier?: unknown }).identifier;
  if (typeof identifier !== 'string') return null;
  const trimmed = identifier.trim();
  return trimmed || null;
}

async function postOnce(url: string, apiKey: string, body: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Teamver-Internal-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  return response.ok;
}

export async function reportTeamverPresentationCompleted(args: {
  workspaceId: string;
  userId: string;
  artifactId: string;
  jobId?: string | null;
}): Promise<boolean> {
  const baseUrl = teamverDesignApiBaseUrl();
  const apiKey = teamverInternalApiKey();
  const workspaceId = args.workspaceId.trim();
  const userId = args.userId.trim();
  const artifactId = args.artifactId.trim();
  if (!baseUrl || !apiKey || !workspaceId || !userId || !artifactId) return false;

  const body = {
    workspace_id: workspaceId,
    user_id: userId,
    artifact_id: artifactId,
    ...(args.jobId?.trim() ? { job_id: args.jobId.trim() } : {}),
  };
  const url = `${baseUrl.replace(/\/$/, '')}/api/internal/product-usage/presentation-completed`;
  try {
    if (await postOnce(url, apiKey, body)) return true;
    return await postOnce(url, apiKey, body);
  } catch {
    try {
      return await postOnce(url, apiKey, body);
    } catch {
      return false;
    }
  }
}

export function schedulePresentationCompletedFromRequest(
  req: Request,
  args: { projectId: string; fileName: string; artifactManifest?: unknown; jobId?: string | null },
): void {
  const identity = readTeamverIdentityFromRequest(req);
  if (!identity) return;
  const artifactId = presentationArtifactId(args);
  if (!artifactId) return;
  // args.jobId는 optional (`string | null | undefined`). 대상 시그니처는
  // `jobId?: string | null` — exactOptionalPropertyTypes 하에서 명시적
  // undefined를 넘길 수 없으므로 undefined면 프로퍼티를 뺀다.
  void reportTeamverPresentationCompleted({
    workspaceId: identity.workspaceId,
    userId: identity.userId,
    artifactId,
    ...(args.jobId !== undefined ? { jobId: args.jobId } : {}),
  }).catch(() => undefined);
}
