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
  attachByokProxyStreamMaterialization: (
    req: Request,
    res: Response,
    projectId: string | undefined | null,
  ) => Promise<void>;
};

function byokProxyMaterializationEnabled(): boolean {
  const raw = (process.env.OD_BYOK_PROXY_MATERIALIZATION ?? '').trim();
  if (raw === '0') return false;
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
    await matRuntime.beforeChatRun(run);
    return { run };
  }

  async function endByokProxyStream(session: ByokProxyMaterializationSession): Promise<void> {
    await matRuntime.afterChatRun(session.run);
  }

  async function attachByokProxyStreamMaterialization(
    req: Request,
    res: Response,
    projectId: string | undefined | null,
  ): Promise<void> {
    const trimmedId = parseProxyProjectId(projectId);
    if (!trimmedId) return;

    let session: ByokProxyMaterializationSession | null = null;
    try {
      session = await beginByokProxyStream(req, trimmedId);
    } catch (err) {
      console.warn(
        '[byok-proxy-materialization] begin failed — proxy continues without sync-down:',
        err instanceof Error ? err.message : err,
      );
      return;
    }
    if (!session) return;

    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      void endByokProxyStream(session!).catch((err) => {
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

    res.on('finish', finalize);
    res.on('close', finalize);
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
