import type { Request, RequestHandler } from 'express';
import type Database from 'better-sqlite3';

import { getProject, insertProject, warmProjectFromPostgres } from './db.js';
import {
  isTeamverDesignManaged,
  isTeamverProjectCollectionRouteSlug,
  isTrustedBackendCaller,
  readTeamverIdentityFromRequest,
  teamverAccessTimeoutMs,
  teamverDesignApiBaseUrl,
  teamverIdentityHeadersFromIdentity,
  type TeamverRequestIdentity,
} from './teamver-project-access.js';
import type { ProjectStorageAccessHooks } from './storage/lazy-project-materialization.js';
import {
  syncTeamverProjectDaemonStateFromRequest,
} from './teamver-project-daemon-state.js';
import { isDaemonDbPostgres } from './storage/daemon-db-runtime.js';

type SqliteDb = Database.Database;

export type TeamverRegistryProjectDetail = {
  odProjectId: string;
  title?: string | null;
  status?: string | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
};

export function teamverDesignApiProjectDetailUrl(projectId: string): string | null {
  const baseUrl = teamverDesignApiBaseUrl();
  if (!baseUrl) return null;
  const trimmed = projectId.trim();
  if (!trimmed) return null;
  return `${baseUrl}/api/v1/projects/${encodeURIComponent(trimmed)}`;
}

function parseRegistryTimestamp(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readRegistryOdProjectId(payload: Record<string, unknown>): string | null {
  const raw = payload.odProjectId ?? payload.od_project_id;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

export async function fetchTeamverRegistryProjectDetail(
  projectId: string,
  identity: TeamverRequestIdentity,
): Promise<TeamverRegistryProjectDetail | null> {
  const url = teamverDesignApiProjectDetailUrl(projectId);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: teamverIdentityHeadersFromIdentity(identity),
      signal: AbortSignal.timeout(teamverAccessTimeoutMs()),
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<string, unknown>;
    const odProjectId = readRegistryOdProjectId(payload) ?? projectId.trim();
    if (!odProjectId) return null;
    return {
      odProjectId,
      title: typeof payload.title === 'string' ? payload.title : null,
      status: typeof payload.status === 'string' ? payload.status : null,
      createdAt: (payload.createdAt ?? payload.created_at ?? null) as string | number | null,
      updatedAt: (payload.updatedAt ?? payload.updated_at ?? null) as string | number | null,
    };
  } catch {
    return null;
  }
}

export function hydrateTeamverProjectInSqlite(
  db: SqliteDb,
  detail: TeamverRegistryProjectDetail,
): ReturnType<typeof getProject> {
  const id = detail.odProjectId.trim();
  const existing = getProject(db, id);
  if (existing) return existing;

  const now = Date.now();
  const updatedAt = parseRegistryTimestamp(detail.updatedAt, now);
  const createdAt = parseRegistryTimestamp(detail.createdAt, updatedAt);
  const title = detail.title?.trim();

  try {
    return insertProject(db, {
      id,
      name: title || id,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      customInstructions: null,
      createdAt,
      updatedAt,
    });
  } catch {
    return getProject(db, id);
  }
}

async function bestEffortMaterialize(
  hooks: ProjectStorageAccessHooks | null | undefined,
  req: Request,
  projectId: string,
): Promise<void> {
  if (!hooks) return;
  try {
    await hooks.ensureMaterialized(req, projectId);
  } catch (err) {
    console.warn(
      JSON.stringify({
        metric: 'teamver_project_sqlite_hydrate_materialize_failed',
        projectId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/**
 * Multi-node embed: registry row exists (RDS) but local sqlite may not.
 * After access middleware grants, materialize a minimal sqlite row from
 * design-api and sync-down scratch before project subroutes run.
 */
export function createTeamverProjectSqliteHydrationMiddleware(
  db: SqliteDb,
  projectStorageHooks: ProjectStorageAccessHooks | null | undefined,
  sendApiError: (...args: unknown[]) => unknown,
): RequestHandler {
  return async (req, res, next) => {
    const projectId = req.params.id;
    if (typeof projectId !== 'string' || !projectId.trim()) return next();
    if (isTeamverProjectCollectionRouteSlug(projectId)) return next();
    if (!isTeamverDesignManaged()) return next();

    const identity = readTeamverIdentityFromRequest(req);
    if (!identity && !isTrustedBackendCaller(req)) {
      return sendApiError(res, 401, 'UNAUTHORIZED', 'teamver identity headers required');
    }
    if (!identity) return next();

    if (isDaemonDbPostgres()) {
      await warmProjectFromPostgres(projectId);
    } else {
      await syncTeamverProjectDaemonStateFromRequest(
        db,
        projectStorageHooks,
        req,
        projectId,
        'import',
      );
    }

    if (!getProject(db, projectId)) {
      const detail = await fetchTeamverRegistryProjectDetail(projectId, identity);
      if (detail) {
        hydrateTeamverProjectInSqlite(db, detail);
      }
    }

    if (!getProject(db, projectId)) return next();

    await bestEffortMaterialize(projectStorageHooks, req, projectId);
    return next();
  };
}