import { randomUUID } from 'node:crypto';

import type { Request, Response } from 'express';

import { isSafeId as isSafeProjectId } from '../projects.js';
import {
  readTeamverIdentityFromRequest,
  readTeamverS3PrefixFromRequest,
} from '../teamver-project-access.js';
import type { ProjectMaterializationRuntime } from './project-materialization-runtime.js';
import { isS3ProjectStorageLayout } from './project-storage-layout.js';

export type ByokProxyMaterializationSession = {
  run: {
    id: string;
    projectId: string;
    teamverIdentity: ReturnType<typeof readTeamverIdentityFromRequest>;
    teamverS3Prefix: string | null;
    projectMaterializationStartedAt?: number;
  };
};

export type ByokProxyMaterializationHooks = {
  beginByokProxyStream: (
    req: Request,
    projectId: string,
  ) => Promise<ByokProxyMaterializationSession | null>;
  endByokProxyStream: (session: ByokProxyMaterializationSession) => Promise<void>;
  /**
   * Wire the materialization lifecycle (sync-down → upstream stream →
   * sync-up) onto the proxy response. Returns:
   *   `{ ok: true }`   — caller should proceed with the upstream stream.
   *   `{ ok: false }`  — begin failed; the caller MUST stop and not stream.
   *                       When fail-fast is enabled (default), this function
   *                       also writes an HTTP 502 to `res` so callers can
   *                       just `return` after seeing `ok: false`.
   */
  attachByokProxyStreamMaterialization: (
    req: Request,
    res: Response,
    projectId: string | undefined | null,
  ) => Promise<{ ok: true } | { ok: false }>;
};

function byokProxyMaterializationEnabled(): boolean {
  const raw = (process.env.OD_BYOK_PROXY_MATERIALIZATION ?? '').trim();
  if (raw === '0') return false;
  return true;
}

/**
 * When begin (sync-down) fails for a BYOK proxy stream, should we 502 the
 * request? Default ON so embed BYOK never streams tool writes into a scratch
 * dir that has no path back to S3 (the historical silent-data-loss case
 * documented in docs-teamver/29). Set `OD_BYOK_PROXY_FAIL_ON_BEGIN=0`
 * (dev only) to fall back to the legacy "warn + stream without sync"
 * behaviour.
 */
function byokProxyFailOnBeginEnabled(): boolean {
  const raw = (process.env.OD_BYOK_PROXY_FAIL_ON_BEGIN ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return true;
}

function parseProxyProjectId(projectId: string | undefined | null): string | null {
  const trimmed = typeof projectId === 'string' ? projectId.trim() : '';
  if (!trimmed || !isSafeProjectId(trimmed)) return null;
  return trimmed;
}

// Server-side materialization lifecycle for embed BYOK proxy streams
// (`POST /api/proxy/*/stream`).
//
// Reuses the managed-run hooks (`beforeChatRun` / `afterChatRun`) without
// creating a daemon `POST /api/runs` row or requiring FE mode changes.
// Browser stays on `mode=api`; sync-down runs at stream start and sync-up
// at HTTP response finish (after tools wrote into scratch).
//
// NOTE: line comments are used here because esbuild closes the block-comment
// scanner on the literal `*/` inside `/api/proxy/*/stream`, producing
// `Expected ";" but found "beforeChatRun"` at transform time.
export function createByokProxyMaterializationHooks(
  runtime: ProjectMaterializationRuntime | null,
): ByokProxyMaterializationHooks | null {
  if (!runtime || !isS3ProjectStorageLayout(runtime.layout)) {
    return null;
  }
  if (!byokProxyMaterializationEnabled()) {
    return null;
  }

  const matRuntime = runtime;

  async function beginByokProxyStream(
    req: Request,
    projectId: string,
  ): Promise<ByokProxyMaterializationSession | null> {
    const trimmedId = parseProxyProjectId(projectId);
    if (!trimmedId) return null;

    const run = {
      id: `byok-proxy-${randomUUID()}`,
      projectId: trimmedId,
      teamverIdentity: readTeamverIdentityFromRequest(req),
      teamverS3Prefix: readTeamverS3PrefixFromRequest(req) ?? null,
    };
    try {
      await matRuntime.beforeChatRun(run);
    } catch (err) {
      // beforeChatRun may have incremented activeProjectRuns before throwing
      // (e.g. sync-down failure). Balance with afterChatRun so idle-evict and
      // concurrent-run guards are not stuck for this projectId.
      try {
        await matRuntime.afterChatRun(run);
      } catch (rollbackErr) {
        console.warn(
          '[byok-proxy-materialization] rollback after failed begin:',
          rollbackErr instanceof Error ? rollbackErr.message : rollbackErr,
        );
      }
      throw err;
    }
    return { run };
  }

  async function endByokProxyStream(session: ByokProxyMaterializationSession): Promise<void> {
    await matRuntime.afterChatRun(session.run);
  }

  async function attachByokProxyStreamMaterialization(
    req: Request,
    res: Response,
    projectId: string | undefined | null,
  ): Promise<{ ok: true } | { ok: false }> {
    const trimmedId = parseProxyProjectId(projectId);
    if (!trimmedId) {
      // No project context (e.g. standalone CLI BYOK without projectId).
      // Nothing to sync; let the stream proceed.
      return { ok: true };
    }

    let session: ByokProxyMaterializationSession | null = null;
    try {
      session = await beginByokProxyStream(req, trimmedId);
    } catch (err) {
      // Sync-down failed. The legacy behaviour was to silently warn and let
      // the stream proceed without any hook, which produced the catastrophic
      // data-loss path (`docs-teamver/29`): tool writes hit scratch, and
      // because no finish hook is registered, they never sync up — until the
      // idle-evict sweep wipes them. Fail-fast (default on) refuses the
      // stream so the FE can show a real error rather than a silent loss.
      const failFast = byokProxyFailOnBeginEnabled();
      console.warn(
        '[byok-proxy-materialization] begin failed:',
        err instanceof Error ? err.message : err,
        failFast ? '— failing stream (fail-fast)' : '— proceeding without sync (legacy)',
      );
      console.info(
        JSON.stringify({
          metric: 'od_byok_proxy_begin_failed',
          projectId: trimmedId,
          failFast,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      if (failFast) {
        if (!res.headersSent) {
          res.status(502).json({
            error: 'project storage unavailable',
            error_code: 'PROJECT_STORAGE_UNAVAILABLE',
            details:
              err instanceof Error ? err.message : 'sync-down failed before streaming',
          });
        }
        return { ok: false };
      }
      // Legacy fallback: let the stream proceed without any sync hook so
      // small/dev deployments do not regress. PR3 may revisit with a
      // minimal "sync-on-close" pseudo-hook for tool writes.
      return { ok: true };
    }
    if (!session) return { ok: true };

    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      void endByokProxyStream(session!).catch((err) => {
        matRuntime.markProjectSyncFailed(session!.run.projectId);
        console.warn(
          '[byok-proxy-materialization] end failed:',
          err instanceof Error ? err.message : err,
        );
        console.info(
          JSON.stringify({
            metric: 'od_s3_sync_up_failed',
            stage: 'byok_proxy_end',
            projectId: session!.run.projectId,
            reason: err instanceof Error ? err.message : String(err),
          }),
        );
      });
    };

    res.once('finish', finalize);
    res.once('close', finalize);
    return { ok: true };
  }

  return {
    beginByokProxyStream,
    endByokProxyStream,
    attachByokProxyStreamMaterialization,
  };
}

/** Read `projectId` from a BYOK proxy JSON body. */
export function readProxyBodyProjectId(body: Record<string, unknown> | null | undefined): string | undefined {
  const raw = body?.projectId;
  return typeof raw === 'string' ? raw : undefined;
}
