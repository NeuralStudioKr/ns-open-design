import { isTeamverEmbedMode } from "./designApiBase";
import { isTeamverEmbedSessionAuthenticated } from "./teamverEmbedSession";
import {
  clearDesignAuthRefreshDecline,
  ensureDesignBffSessionAuthenticated,
  isDesignAuthRefreshDeclineHard,
  isDesignAuthRefreshDeclined,
  probeDesignBffSessionAuthenticated,
  refreshDesignAuthCookie,
} from "./designBffClient";
import { handleEmbedPassiveUnauthorized } from "./teamverEmbedPassiveAuth";
import { readActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { resolveTeamverProjectS3PrefixForDaemon } from "./teamverProjectS3PrefixResolve";

/** HA sibling Set-Cookie race — mirror BFF/Drive soft retry delay (400ms). */
const DAEMON_AUTH_RETRY_DELAY_MS = 400;

/** Thrown when embed daemon `/api/*` still returns 401 after cookie recovery. */
export class TeamverDaemonUnauthorizedError extends Error {
  readonly code = "TEAMVER_DAEMON_UNAUTHORIZED";

  constructor() {
    super("teamver_daemon_unauthorized");
    this.name = "TeamverDaemonUnauthorizedError";
  }
}

export function throwIfDaemonUnauthorized(resp: Response): void {
  if (resp.status === 401) {
    throw new TeamverDaemonUnauthorizedError();
  }
}

const DAEMON_PROJECT_ID_RE =
  /\/api\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function extractDaemonProjectId(input: RequestInfo | URL): string | undefined {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? `${input.pathname}${input.search}`
        : input.url;
  try {
    const path = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : raw;
    return DAEMON_PROJECT_ID_RE.exec(path)?.[1];
  } catch {
    return DAEMON_PROJECT_ID_RE.exec(raw)?.[1];
  }
}

function headersInitToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

export type TeamverDaemonFetchInit = RequestInit & {
  /** When the URL is not `/api/projects/{uuid}/…` (BYOK proxy, `POST /api/runs`). */
  teamverProjectId?: string | null;
  /**
   * Background polls (e.g. GET /api/proxy/active) must not enter soft-sticky
   * refresh/probe ladders — C1 / explicit user retry owns recovery. Without
   * this, App runs-poll hammers refresh→probe×2 every few seconds while the
   * cookie is dead.
   */
  skipEmbedAuthRecovery?: boolean;
  /**
   * Best-effort daemon endpoints such as memory extraction still need cookie
   * auth recovery, but must not trigger active-workspace BFF lookups before a
   * chat run starts.
   */
  skipTeamverWorkspaceHeaders?: boolean;
};

function isLikelyDaemonApiRequest(input: RequestInfo | URL): boolean {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? `${input.pathname}${input.search}`
        : input.url;
  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : null;
    const path = url ? url.pathname : raw;
    return path.startsWith("/api/");
  } catch {
    return raw.startsWith("/api/");
  }
}

const daemonGetInflight = new Map<string, Promise<Response>>();

function daemonGetInflightKey(
  input: RequestInfo | URL,
  init: RequestInit,
  headers: Record<string, string>,
): string | null {
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET") return null;
  if (init.signal) return null;
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const headerKey = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}`)
    .join("\n");
  return `${url}\n${headerKey}`;
}

function embedDaemonAuthRecoveryEnabled(init?: RequestInit): boolean {
  if (!isTeamverEmbedMode()) return false;
  // Only recover while the embed UI believes it is signed in. Bootstrap alone
  // used to keep probing refresh/session after logout / dead-cookie clear.
  if (!isTeamverEmbedSessionAuthenticated()) return false;
  // Hard sticky (400): C1 + banner own recovery — never POST from daemon 401s.
  if (isDesignAuthRefreshDeclineHard()) return false;
  // Soft sticky: GET/HEAD polls must not re-enter refresh/probe. Mutations
  // (POST/PUT/PATCH/DELETE) may still try soft survival (conversation save,
  // artifact write). Project re-entry listConversations calls refresh explicitly.
  if (isDesignAuthRefreshDeclined()) {
    const method = (init?.method || "GET").toUpperCase();
    return method !== "GET" && method !== "HEAD";
  }
  return true;
}

function shouldRecoverEmbedDaemonUnauthorized(
  input: RequestInfo | URL,
  resp: Response,
  init?: RequestInit,
): boolean {
  return (
    resp.status === 401
    && embedDaemonAuthRecoveryEnabled(init)
    && isLikelyDaemonApiRequest(input)
  );
}

function noteEmbedDaemonUnauthorized(input: RequestInfo | URL, resp: Response): void {
  // Notify even when recovery is disabled (hard sticky / logged-out memory) so
  // the session banner can still offer "다시 시도". Recovery itself stays gated
  // by embedDaemonAuthRecoveryEnabled inside fetchDaemonWithEmbedAuthRecovery.
  if (resp.status !== 401) return;
  if (!isTeamverEmbedMode()) return;
  if (!isLikelyDaemonApiRequest(input)) return;
  if (!isTeamverEmbedSessionAuthenticated()) return;
  handleEmbedPassiveUnauthorized("daemon");
}

function delayDaemonAuthRetry(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, DAEMON_AUTH_RETRY_DELAY_MS);
  });
}

/**
 * Embed daemon `/api/*` passes nginx auth_request. Long runs can expire the
 * BFF access token mid-flight; mutating calls like artifact save must refresh
 * once and retry instead of surfacing a false "session expired" banner while
 * the UI still looks signed in.
 */
async function fetchDaemonWithEmbedAuthRecovery(
  input: RequestInfo | URL,
  init: RequestInit,
  options?: { skipAuthRecovery?: boolean },
): Promise<Response> {
  let resp = await fetch(input, init);
  if (options?.skipAuthRecovery || !shouldRecoverEmbedDaemonUnauthorized(input, resp, init)) {
    // Hard sticky / unauthenticated / explicit skip: surface banner without
    // probing. Background polls must take the skip path.
    noteEmbedDaemonUnauthorized(input, resp);
    return resp;
  }

  const refreshed = await refreshDesignAuthCookie({ allowSoftForcePost: true });
  if (refreshed) {
    resp = await fetch(input, init);
    if (!shouldRecoverEmbedDaemonUnauthorized(input, resp, init)) {
      clearDesignAuthRefreshDecline();
      return resp;
    }
  }

  // Soft sticky may have been marked during refresh — stop here so we do not
  // stack ensure/probe on top of the ladder that just declined.
  if (isDesignAuthRefreshDeclined()) {
    noteEmbedDaemonUnauthorized(input, resp);
    return resp;
  }

  // Another tab/node may have rotated cookies while this request saw 401.
  await delayDaemonAuthRetry();
  resp = await fetch(input, init);
  if (!shouldRecoverEmbedDaemonUnauthorized(input, resp, init)) {
    clearDesignAuthRefreshDecline();
    return resp;
  }
  // Refresh + soft-wait still 401. When the access token has passed absolute
  // expiry and nginx auth_request keeps blocking, session-probe alone cannot
  // revive it — GET /auth/session (ensure_bff_session) can Set-Cookie a fresh
  // access on the main response so the next daemon fetch clears auth_request.
  if (await ensureDesignBffSessionAuthenticated()) {
    clearDesignAuthRefreshDecline();
    resp = await fetch(input, init);
    if (!shouldRecoverEmbedDaemonUnauthorized(input, resp, init)) {
      return resp;
    }
  }
  // Ensure failed. Only clear sticky when the next daemon fetch would succeed;
  // probe-alive alone used to unlock soft sticky and re-open POST storms.
  if (await probeDesignBffSessionAuthenticated()) {
    resp = await fetch(input, init);
    if (resp.status !== 401) {
      clearDesignAuthRefreshDecline();
      return resp;
    }
  }
  noteEmbedDaemonUnauthorized(input, resp);
  return resp;
}

async function finalizeDaemonFetch(
  _input: RequestInfo | URL,
  resp: Response,
  options: { clone?: boolean } = {},
): Promise<Response> {
  // Dedupe cache-hit callers each need their own Response (a single body can
  // only be read once). Non-cache callers own the response outright and
  // cloning would (a) waste memory and (b) break streaming test mocks that
  // omit `clone()` on the plain-object stub. Default to no-clone; the cache
  // hit path opts in explicitly.
  if (options.clone && typeof (resp as Response).clone === "function") {
    return (resp as Response).clone();
  }
  return resp;
}

/** Embed active workspace for daemon `/api/*` — aligns run usage/billing with BFF headers. */
export async function buildTeamverDaemonRequestHeaders(
  base: Record<string, string>,
  options?: { projectId?: string },
): Promise<Record<string, string>> {
  if (!isTeamverEmbedMode()) return base;
  const workspaceId = await readActiveTeamverWorkspaceId();
  const headers: Record<string, string> = { ...base };
  if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
  const projectId = options?.projectId?.trim();
  if (workspaceId && projectId) {
    const s3Prefix = await resolveTeamverProjectS3PrefixForDaemon(workspaceId, projectId);
    if (s3Prefix) headers["X-Teamver-S3-Prefix"] = s3Prefix;
  }
  return headers;
}

/** fetch wrapper — embed mode forwards active workspace so nginx/daemon access matches BFF registry. */
export async function fetchTeamverDaemon(
  input: RequestInfo | URL,
  init: TeamverDaemonFetchInit = {},
): Promise<Response> {
  const {
    teamverProjectId,
    skipEmbedAuthRecovery,
    skipTeamverWorkspaceHeaders,
    ...requestInit
  } = init;
  const projectId = teamverProjectId?.trim() || extractDaemonProjectId(input);
  const baseHeaders = headersInitToRecord(requestInit.headers);
  const headers = skipTeamverWorkspaceHeaders
    ? baseHeaders
    : await buildTeamverDaemonRequestHeaders(
      baseHeaders,
      projectId ? { projectId } : undefined,
    );
  // Embed `/api/*` routes pass nginx auth_request → BFF session-probe
  // (`/_teamver_bff_session`). Match BFF cookie SSO (`credentials: include`) so
  // teamver_access_token is always forwarded — same-origin default is usually
  // enough, but explicit include avoids sporadic 302 signin on background
  // polls like GET /api/runs.
  const credentials =
    requestInit.credentials ?? (isTeamverEmbedMode() ? "include" : "same-origin");
  const redirect =
    requestInit.redirect ?? (isTeamverEmbedMode() && isLikelyDaemonApiRequest(input) ? "manual" : undefined);
  const nextInit = { ...requestInit, headers, credentials, ...(redirect ? { redirect } : {}) };
  const recoveryOpts = skipEmbedAuthRecovery ? { skipAuthRecovery: true } : undefined;
  const dedupeKey = daemonGetInflightKey(input, requestInit, headers);
  if (!dedupeKey) {
    const resp = await fetchDaemonWithEmbedAuthRecovery(input, nextInit, recoveryOpts);
    return finalizeDaemonFetch(input, resp);
  }
  const existing = daemonGetInflight.get(dedupeKey);
  if (existing) return existing.then((resp) => finalizeDaemonFetch(input, resp, { clone: true }));
  const promise = fetchDaemonWithEmbedAuthRecovery(input, nextInit, recoveryOpts);
  daemonGetInflight.set(dedupeKey, promise);
  try {
    const resp = await promise;
    // Clone here too: `promise` stays in the cache long enough for a sibling
    // read to consume its body before we release the map entry in `finally`,
    // and both readers must be able to drain the response independently.
    return finalizeDaemonFetch(input, resp, { clone: true });
  } finally {
    daemonGetInflight.delete(dedupeKey);
  }
}
