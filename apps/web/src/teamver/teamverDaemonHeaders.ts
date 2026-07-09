import { isBootstrapAuthMode, isTeamverEmbedMode } from "./designApiBase";
import { handleEmbedPassiveUnauthorized } from "./teamverEmbedPassiveAuth";
import { readActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { resolveTeamverProjectS3PrefixForDaemon } from "./teamverProjectS3PrefixResolve";

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

function maybeRedirectOnEmbedDaemonUnauthorized(
  input: RequestInfo | URL,
  resp: Response,
): void {
  if (
    resp.status !== 401
    || !isTeamverEmbedMode()
    || !isBootstrapAuthMode()
    || !isLikelyDaemonApiRequest(input)
  ) {
    return;
  }
  void input;
  handleEmbedPassiveUnauthorized("daemon");
}

async function finalizeDaemonFetch(
  input: RequestInfo | URL,
  resp: Response,
): Promise<Response> {
  maybeRedirectOnEmbedDaemonUnauthorized(input, resp);
  return resp.clone();
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
  const { teamverProjectId, ...requestInit } = init;
  const projectId = teamverProjectId?.trim() || extractDaemonProjectId(input);
  const headers = await buildTeamverDaemonRequestHeaders(
    headersInitToRecord(requestInit.headers),
    projectId ? { projectId } : undefined,
  );
  // Embed `/api/*` routes pass nginx auth_request → Main BE session-check.
  // Match BFF cookie SSO (`credentials: include`) so teamver_access_token
  // is always forwarded — same-origin default is usually enough, but explicit
  // include avoids sporadic 302 signin on background polls like GET /api/runs.
  const credentials =
    requestInit.credentials ?? (isTeamverEmbedMode() ? "include" : "same-origin");
  const redirect =
    requestInit.redirect ?? (isTeamverEmbedMode() && isLikelyDaemonApiRequest(input) ? "manual" : undefined);
  const nextInit = { ...requestInit, headers, credentials, ...(redirect ? { redirect } : {}) };
  const dedupeKey = daemonGetInflightKey(input, requestInit, headers);
  if (!dedupeKey) {
    const resp = await fetch(input, nextInit);
    return finalizeDaemonFetch(input, resp);
  }
  const existing = daemonGetInflight.get(dedupeKey);
  if (existing) return existing.then((resp) => finalizeDaemonFetch(input, resp));
  const promise = fetch(input, nextInit);
  daemonGetInflight.set(dedupeKey, promise);
  try {
    const resp = await promise;
    return finalizeDaemonFetch(input, resp);
  } finally {
    daemonGetInflight.delete(dedupeKey);
  }
}
