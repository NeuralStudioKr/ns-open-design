import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';

import { readTeamverIdentityFromRequest } from './teamver-project-access.js';

/**
 * Cancellation policy for embed BYOK proxy streams (PR1 §3.5).
 *
 * - **Explicit Stop**: the FE Stop button calls `POST /api/proxy/abort
 *   { streamId }` (sent with `keepalive` so page navigation does not
 *   strand the abort). The daemon looks up the registered
 *   `AbortController` and aborts the upstream LLM `fetch()`. The
 *   `afterChatRun` materialization hook still runs (sync-up commits any
 *   tool writes the agent made up to the abort point).
 * - **Page exit / connection drop**: `req.on('close')` does NOT call the
 *   registered abort. The upstream stream is allowed to drain naturally
 *   so background tool work (image generation, S3 writes) finishes and
 *   the run-end sync-up commits to S3. The browser-side fetch is dead;
 *   the daemon just absorbs the response.
 *
 * This separation matches the user's explicit cancellation policy from
 * the audit decision: "작업을 stop 한 경우에는 stop. 페이지 이탈 등을
 * 한 경우에는 백그라운드에서 실행."
 *
 * `streamId` is exposed to the FE via the `X-Stream-Id` response header
 * (set before SSE streaming starts). Connected responses are dropped on
 * finish. If the browser leaves and the response closes first, the entry
 * stays until the route later calls `res.end()` after upstream drain, with
 * a bounded fallback TTL for genuinely orphaned handlers.
 */

/**
 * Fallback window after `res.close` before the registry entry is removed.
 * Bridges the race where the FE Stop button fires the abort POST and the
 * local fetch abort in the same tick — `res.close` fires within a few ms
 * and we want the daemon-side `POST /api/proxy/abort` (which lands a few
 * ms later) to still find the entry.
 *
 * Page-exit paths don't send the abort POST at all. In that case the
 * upstream route keeps draining in the daemon, and this entry must remain
 * listable so a returning page can show "still working" and keep refreshing
 * messages/files. The patched `res.end` below clears the entry when the
 * upstream handler naturally finishes; this TTL is only a leak bound.
 */
const ABORT_CLOSE_FALLBACK_TTL_MS = 15 * 60_000;

type RegisteredStream = {
  controller: AbortController;
  registeredAt: number;
  workspaceId?: string;
  projectId?: string;
  conversationId?: string;
  assistantMessageId?: string;
};

const activeProxyStreams = new Map<string, RegisteredStream>();

/**
 * Maximum number of entries kept in the active stream registry. Each
 * entry is small (~5 fields) but acts as a defense-in-depth bound — a
 * registration leak (handler that forgets to clean up on close) cannot
 * exhaust daemon heap. When the cap is reached, the oldest entry wins
 * eviction and its controller is aborted as a safety measure (the
 * upstream stream was almost certainly already orphaned).
 */
const MAX_ACTIVE_PROXY_STREAMS = 4096;

function evictOldestIfFull(): void {
  if (activeProxyStreams.size < MAX_ACTIVE_PROXY_STREAMS) return;
  // Map iteration order is insertion order, so the first entry is the
  // oldest. Abort and drop it.
  const oldestKey = activeProxyStreams.keys().next().value;
  if (!oldestKey) return;
  const entry = activeProxyStreams.get(oldestKey);
  activeProxyStreams.delete(oldestKey);
  if (entry) {
    try {
      entry.controller.abort();
    } catch {
      // best-effort
    }
    console.warn(
      JSON.stringify({
        metric: 'od_byok_proxy_abort_registry_evict',
        streamId: oldestKey,
        ageMs: Date.now() - entry.registeredAt,
        size: activeProxyStreams.size,
      }),
    );
  }
}

export type ByokProxyAbortRegistration = {
  streamId: string;
  signal: AbortSignal;
};

/**
 * Register a new abortable proxy stream for `res`. Emits the
 * `X-Stream-Id` response header so the FE can subsequently target this
 * stream for cancellation. Registry entries are cleared on connected
 * response finish and also when the upstream handler later calls `res.end`
 * after a detached browser response has closed.
 *
 * Pass the returned `signal` into every upstream `fetch()` (and any
 * downstream tool fetch) so the abort cascades end-to-end.
 */
export function registerByokProxyStream(
  _req: Request,
  res: Response,
  meta?: {
    workspaceId?: string | null;
    projectId?: string | null;
    conversationId?: string | null;
    assistantMessageId?: string | null;
  },
): ByokProxyAbortRegistration {
  const streamId = randomUUID();
  const controller = new AbortController();
  evictOldestIfFull();
  activeProxyStreams.set(streamId, {
    controller,
    registeredAt: Date.now(),
    ...(meta?.workspaceId ? { workspaceId: meta.workspaceId } : {}),
    ...(meta?.projectId ? { projectId: meta.projectId } : {}),
    ...(meta?.conversationId ? { conversationId: meta.conversationId } : {}),
    ...(meta?.assistantMessageId ? { assistantMessageId: meta.assistantMessageId } : {}),
  });
  if (!res.headersSent) {
    try {
      res.setHeader('X-Stream-Id', streamId);
    } catch {
      // headersSent race — fine to skip; FE can still abort via
      // its local AbortController, just not via the explicit endpoint.
    }
  }
  let cleared = false;
  const clearImmediate = () => {
    if (cleared) return;
    cleared = true;
    activeProxyStreams.delete(streamId);
  };
  const endPatchTarget = res as unknown as { end?: (...args: any[]) => any };
  if (typeof endPatchTarget.end === 'function') {
    const originalEnd = endPatchTarget.end.bind(res);
    endPatchTarget.end = (...args: any[]) => {
      clearImmediate();
      return originalEnd(...args);
    };
  }
  res.once('finish', clearImmediate);
  res.once('close', () => {
    if (cleared) return;
    setTimeout(clearImmediate, ABORT_CLOSE_FALLBACK_TTL_MS).unref();
  });
  return { streamId, signal: controller.signal };
}

/**
 * Trigger an upstream abort for `streamId`. Returns `true` when the
 * stream was registered and the abort was called, `false` if the stream
 * is unknown (already finished, never registered, or wrong id).
 */
export function abortByokProxyStream(streamId: string): boolean {
  const entry = activeProxyStreams.get(streamId);
  if (!entry) return false;
  activeProxyStreams.delete(streamId);
  try {
    entry.controller.abort();
  } catch {
    return false;
  }
  console.info(
    JSON.stringify({
      metric: 'od_byok_proxy_aborted',
      streamId,
      ageMs: Date.now() - entry.registeredAt,
      ...(entry.workspaceId ? { workspaceId: entry.workspaceId } : {}),
      ...(entry.projectId ? { projectId: entry.projectId } : {}),
    }),
  );
  return true;
}

/** @internal vitest — inspect the registry size. */
export function activeByokProxyStreamCountForTests(): number {
  return activeProxyStreams.size;
}

export type ActiveByokProxyStreamSummary = {
  streamId: string;
  workspaceId?: string;
  projectId?: string;
  conversationId?: string;
  assistantMessageId?: string;
  registeredAt: number;
};

/**
 * List in-flight BYOK proxy streams for embed background recovery. The FE
 * uses this after page re-entry to decide whether a detached API-mode turn
 * is still draining on the daemon.
 */
export function listActiveByokProxyStreams(options?: {
  workspaceId?: string | null;
  projectId?: string | null;
}): ActiveByokProxyStreamSummary[] {
  const workspaceId = options?.workspaceId?.trim() ?? '';
  const projectId = options?.projectId?.trim() ?? '';
  const out: ActiveByokProxyStreamSummary[] = [];
  for (const [streamId, entry] of activeProxyStreams.entries()) {
    if (workspaceId && entry.workspaceId !== workspaceId) continue;
    if (projectId && entry.projectId !== projectId) continue;
    out.push({
      streamId,
      ...(entry.workspaceId ? { workspaceId: entry.workspaceId } : {}),
      ...(entry.projectId ? { projectId: entry.projectId } : {}),
      ...(entry.conversationId ? { conversationId: entry.conversationId } : {}),
      ...(entry.assistantMessageId ? { assistantMessageId: entry.assistantMessageId } : {}),
      registeredAt: entry.registeredAt,
    });
  }
  return out;
}

/** @internal vitest — reset the registry between cases. */
export function resetByokProxyStreamRegistryForTests(): void {
  for (const { controller } of activeProxyStreams.values()) {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }
  activeProxyStreams.clear();
}

/**
 * Returns an unbound `AbortSignal` substitute for handlers that opt out
 * of registration (e.g. internal-only request paths that should never be
 * cancelled from the FE). The signal is never aborted, so plumbing it
 * into `fetch({ signal })` is a no-op rather than a bug.
 */
export function neverAbortedSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * Register the `POST /api/proxy/abort` endpoint. Accepts a JSON body
 * `{ streamId: string }`. Always answers 200 with `{ aborted: boolean }`
 * — never 4xx on unknown streamId so the FE never has to special-case a
 * race against natural completion (Stop click after the stream already
 * ended is benign).
 *
 * Defense-in-depth: when the registered stream carries a `workspaceId`,
 * the abort request must originate from the same workspace (verified
 * via the standard daemon identity headers — same path embed BYOK
 * already uses for usage/billing). On mismatch we answer
 * `{ aborted: false }` to avoid leaking stream existence to an
 * unauthorized caller. `streamId` is a 122-bit cryptographically random
 * UUID and is only delivered to the originating session via the
 * `X-Stream-Id` response header, so the tenant check is belt-and-braces.
 */
export function registerByokProxyAbortRoute(app: Express): void {
  app.get('/api/proxy/active', (req, res) => {
    const identity = readTeamverIdentityFromRequest(req);
    if (!identity?.workspaceId?.trim()) {
      res.json({ streams: [] });
      return;
    }
    const projectId =
      typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
    const streams = listActiveByokProxyStreams({
      workspaceId: identity?.workspaceId ?? null,
      projectId: projectId || null,
    });
    res.json({ streams });
  });

  app.post('/api/proxy/abort', (req, res) => {
    const streamId =
      typeof req.body?.streamId === 'string' ? req.body.streamId.trim() : '';
    if (!streamId) {
      res.status(400).json({ error: 'streamId required' });
      return;
    }
    const requestedConversationId =
      typeof req.body?.conversationId === 'string'
        ? req.body.conversationId.trim()
        : '';
    const entry = activeProxyStreams.get(streamId);
    if (!entry) {
      res.json({ aborted: false });
      return;
    }
    if (entry.workspaceId) {
      const callerWorkspaceId =
        readTeamverIdentityFromRequest(req)?.workspaceId?.trim() ?? '';
      if (callerWorkspaceId !== entry.workspaceId) {
        console.warn(
          JSON.stringify({
            metric: 'od_byok_proxy_abort_tenant_mismatch',
            streamId,
            expected: entry.workspaceId,
            // No raw caller id in logs — workspaceId already identifies tenant
            // and we don't want to log "anonymous" / odd values verbatim.
            callerPresent: Boolean(callerWorkspaceId),
          }),
        );
        res.json({ aborted: false });
        return;
      }
    }
    // Defense-in-depth: if the caller supplied a conversationId (new FE
    // Stop flow) and the entry has one, they must match. This prevents
    // a compromised/legacy caller from aborting a *different* conversation
    // within the same workspace after obtaining a stale stream list — the
    // primary guard is the FE conversation filter, this closes the race
    // where the daemon list is fetched before a conversation switch.
    if (
      requestedConversationId
      && entry.conversationId
      && requestedConversationId !== entry.conversationId
    ) {
      console.warn(
        JSON.stringify({
          metric: 'od_byok_proxy_abort_conversation_mismatch',
          streamId,
          expected: entry.conversationId,
          got: requestedConversationId,
        }),
      );
      res.json({ aborted: false });
      return;
    }
    const aborted = abortByokProxyStream(streamId);
    res.json({ aborted });
  });
}
