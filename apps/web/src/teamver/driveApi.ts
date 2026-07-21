import { snakeToCamelDeep } from "@teamver/app-sdk";
import { resolveTeamverDriveBffBase } from "./designApiBase";
import {
  fetchDesignAuthSession,
  isDesignAuthRefreshDeclined,
  refreshDesignAuthCookie,
} from "./designBffClient";
import { recoverStaleDriveWorkspace } from "./driveWorkspaceRecovery";
import { isTeamverEmbedSessionAuthenticated } from "./teamverEmbedSession";

export function teamverDriveApiUrl(path: string): string {
  const suffix = path.replace(/^\//, "");
  return `${resolveTeamverDriveBffBase().replace(/\/+$/, "")}/${suffix}`;
}

/**
 * True when a Drive BFF 401/403 body means "do not call /auth/refresh".
 * BFF already force-refreshed on upstream Invalid token, and nginx/session
 * expiry bodies only create refresh-token rotation races if retried here.
 *
 * Also covers Main ACL bodies (`{"message":"error.forbidden"}`) — Apps
 * refresh cannot fix workspace membership and must not be attempted.
 */
function normalizeDriveAuthDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const msg = (entry as Record<string, unknown>).msg;
          return typeof msg === "string" ? msg : null;
        }
        return null;
      })
      .filter((part): part is string => Boolean(part?.trim()));
    return parts.length > 0 ? parts.join(" ") : null;
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.detail === "string") return record.detail;
    if (typeof record.code === "string") return record.code;
    if (typeof record.error === "string") return record.error;
    if (record.error && typeof record.error === "object") {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
      if (typeof nested.code === "string") return nested.code;
    }
  }
  return null;
}

/** Pull skippable auth/ACL text from a Drive error JSON body (detail or message). */
export function extractDriveAuthBodyText(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as Record<string, unknown>;
  if ("detail" in record && record.detail != null) return record.detail;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  // DesignDomainError shape: { error: { code, message } }
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
    if (typeof nested.code === "string") return nested.code;
  }
  return body;
}

export function shouldSkipDriveAuthRefresh(detail: unknown): boolean {
  const text = normalizeDriveAuthDetail(detail);
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  if (normalized === "session_expired") return true;
  if (normalized === "unauthorized") return true;
  if (normalized.includes("invalid token")) return true;
  if (normalized.includes("error.authentication")) return true;
  if (normalized.includes("missing_access_token")) return true;
  // Main ACL / workspace gate — not recoverable via Apps JWT refresh.
  if (normalized === "forbidden") return true;
  if (normalized === "error.forbidden") return true;
  if (normalized.includes("error.workspace")) return true;
  if (normalized.includes("error.forbidden")) return true;
  // Main HS256 SSO expired — Apps refresh cannot revive it; only Main
  // parent-domain re-login can. Skip BFF refresh and surface immediately.
  if (normalized === "main_sso_required") return true;
  if (normalized === "main_sso_user_mismatch") return true;
  return false;
}

/** True when Design BFF session user and Main SSO cookie user disagree. */
export function isDriveMainSsoUserMismatchBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  if (record.code === "main_sso_user_mismatch") return true;
  if (typeof record.error === "string"
    && record.error.trim().toLowerCase() === "main_sso_user_mismatch") {
    return true;
  }
  const detail = record.detail;
  return typeof detail === "string"
    && detail.trim().toLowerCase() === "main_sso_user_mismatch";
}

/**
 * True when Drive 401 body says Main HS256 SSO cookie is missing/expired.
 * FE must not spin BFF refresh — Apps JWT never satisfies Main Drive HS256.
 * Distinct from ``main_sso_user_mismatch`` (wrong Main account vs Design).
 */
export function isDriveMainSsoRequiredBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  if (isDriveMainSsoUserMismatchBody(body)) return false;
  const record = body as Record<string, unknown>;
  if (record.code === "main_sso_required") return true;
  if (record.re_login_scope === "main") return true;
  const detail = record.detail;
  if (typeof detail !== "string") return false;
  return detail.trim().toLowerCase() === "main_sso_required";
}

/** Main SSO gate: missing/expired cookie OR wrong Main account vs Design. */
export function isDriveMainSsoGateBody(body: unknown): boolean {
  return isDriveMainSsoRequiredBody(body) || isDriveMainSsoUserMismatchBody(body);
}

/** True when the body is workspace ACL forbid (not SSO expiry). */
export function isDriveWorkspaceForbiddenBody(detail: unknown): boolean {
  const text = normalizeDriveAuthDetail(detail);
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "forbidden"
    || normalized === "error.forbidden"
    || normalized.includes("error.forbidden")
    || normalized.includes("error.workspace")
  );
}

/** Limit concurrent Drive BFF calls (browse/recent/thumbs) without full serialization. */
const DRIVE_FETCH_MAX_CONCURRENT = 4;
let driveFetchActive = 0;
const driveFetchWaiters: Array<{
  resolve: () => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}> = [];

function createDriveAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfDriveAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createDriveAbortError();
}

async function acquireDriveFetchSlot(signal?: AbortSignal): Promise<void> {
  throwIfDriveAborted(signal);
  if (driveFetchActive < DRIVE_FETCH_MAX_CONCURRENT) {
    driveFetchActive += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const entry: (typeof driveFetchWaiters)[number] = {
      resolve: () => {
        cleanup();
        resolve();
      },
      reject: (reason) => {
        cleanup();
        reject(reason);
      },
      signal,
    };
    const onAbort = () => {
      const index = driveFetchWaiters.indexOf(entry);
      if (index >= 0) driveFetchWaiters.splice(index, 1);
      entry.reject(createDriveAbortError());
    };
    entry.onAbort = onAbort;
    const cleanup = () => {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    driveFetchWaiters.push(entry);
  });
  throwIfDriveAborted(signal);
  driveFetchActive += 1;
}

function releaseDriveFetchSlot(): void {
  driveFetchActive = Math.max(0, driveFetchActive - 1);
  const next = driveFetchWaiters.shift();
  if (next) next.resolve();
}

function enqueueDriveFetch<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return (async () => {
    await acquireDriveFetchSlot(signal);
    try {
      throwIfDriveAborted(signal);
      return await run();
    } finally {
      releaseDriveFetchSlot();
    }
  })();
}

/** Match BFF/daemon HA Set-Cookie settle delay (DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS). */
const DRIVE_AUTH_RETRY_DELAY_MS = 400;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfDriveAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createDriveAbortError());
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** True when Drive 401 is the HA/session_expired shape we may soft-recover. */
export function isDriveHaSessionExpiredBody(detail: unknown): boolean {
  const text = normalizeDriveAuthDetail(detail);
  if (!text) return false;
  return text.trim().toLowerCase() === "session_expired";
}

async function recoverDriveAuthSession(): Promise<boolean> {
  // Soft or hard sticky: only the shared refresh ladder (survival cooldown +
  // soft force-POST). Direct probe/force `/auth/session` here bypasses §17
  // cooldowns and re-opens ensure storms on every Drive 401.
  if (isDesignAuthRefreshDeclined()) {
    return refreshDesignAuthCookie();
  }

  const refreshed = await refreshDesignAuthCookie();
  if (refreshed) return true;

  // Sibling Set-Cookie may land without sticky — one force session read.
  try {
    const session = await fetchDesignAuthSession({ force: true });
    return Boolean(session?.authenticated);
  } catch {
    return false;
  }
}

async function teamverDriveFetch(
  path: string,
  init: RequestInit,
  workspaceId?: string | null,
): Promise<Response> {
  const signal = init.signal ?? undefined;
  return enqueueDriveFetch(async () => {
    throwIfDriveAborted(signal);
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const trimmedWorkspaceId = workspaceId?.trim() || null;
    if (trimmedWorkspaceId) headers.set("X-Workspace-Id", trimmedWorkspaceId);

    const doFetch = (overrideWorkspaceId?: string | null) => {
      const fetchHeaders = overrideWorkspaceId ? new Headers(headers) : headers;
      if (overrideWorkspaceId) fetchHeaders.set("X-Workspace-Id", overrideWorkspaceId);
      return fetch(teamverDriveApiUrl(path), {
        ...init,
        credentials: "include",
        headers: fetchHeaders,
        signal,
      });
    };

    let response = await doFetch();
    throwIfDriveAborted(signal);
    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    const body = await response.clone().json().catch(() => null);
    const detail = extractDriveAuthBodyText(body);

    // Workspace ACL 403 → the store's workspace_id is likely stale (user removed
    // from workspace, workspace archived, or cross-tab Main account switch).
    // Force a fresh session probe + workspace reconcile. Apps `/auth/refresh` is
    // deliberately skipped: it rotates the Apps JWT but never affects Main ACL.
    if (response.status === 403 && isDriveWorkspaceForbiddenBody(detail)) {
      const recoveredWorkspaceId = await recoverStaleDriveWorkspace(trimmedWorkspaceId);
      throwIfDriveAborted(signal);
      if (recoveredWorkspaceId) {
        // Retry once with the reconciled workspace. `workspace-changed` has
        // already been dispatched by the sync so mounted callers refetch their
        // own caches for the new workspace.
        return doFetch(recoveredWorkspaceId);
      }
      return response;
    }

    if (shouldSkipDriveAuthRefresh(detail)) {
      // Main HS256 SSO gate cannot be soft-retried — parent-domain re-login
      // is the only recovery (missing cookie, expired cookie, or wrong Main
      // account vs Design BFF). Surface immediately — no BFF refresh.
      if (isDriveMainSsoGateBody(body)) {
        return response;
      }
      // Soft retry first: Apps /auth/refresh cannot revive Main HS256 SSO that
      // Drive proxy forwards. Another sibling may have just written cookies.
      await delay(DRIVE_AUTH_RETRY_DELAY_MS, signal);
      throwIfDriveAborted(signal);
      const softRetried = await doFetch();
      if (softRetried.status !== 401 && softRetried.status !== 403) {
        return softRetried;
      }
      // Only session_expired is an HA-recoverable skip body. Invalid token /
      // unauthorized / missing_access_token must NOT POST /auth/refresh again
      // (rotation races) — soft-retry only, then surface 401.
      // session_expired may still recover via probe/ensure under hard sticky
      // (HA false-400); recoverDriveAuthSession never POSTs while hard.
      if (
        isDriveHaSessionExpiredBody(detail)
        && (isTeamverEmbedSessionAuthenticated() || isDesignAuthRefreshDeclined())
      ) {
        const recovered = await recoverDriveAuthSession();
        throwIfDriveAborted(signal);
        if (recovered) return doFetch();
      }
      return softRetried;
    }

    // Prefer not to recover on bare 403 — Apps refresh never grants Main ACL.
    if (response.status === 403) {
      return response;
    }

    const recovered = await recoverDriveAuthSession();
    throwIfDriveAborted(signal);
    if (recovered) response = await doFetch();
    return response;
  }, signal);
}

export type TeamverDriveFetchOptions = {
  signal?: AbortSignal;
};

async function readDriveErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

/** @internal exported for unit tests */
export function driveErrorCodeForStatus(status: number, body: unknown): string {
  if (status === 401 && isDriveMainSsoUserMismatchBody(body)) {
    return "teamver_drive_main_sso_user_mismatch";
  }
  if (status === 401 && isDriveMainSsoRequiredBody(body)) {
    return "teamver_drive_main_sso_required";
  }
  return `teamver_drive_fetch_failed:${status}`;
}

/** True when a Drive fetch error was raised because Main HS256 SSO expired. */
export function isTeamverDriveMainSsoRequiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.trim();
  return (
    message === "teamver_drive_main_sso_required"
    || message === "main_sso_required"
  );
}

/** True when Main SSO JWT user ≠ Design BFF session user. */
export function isTeamverDriveMainSsoUserMismatchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.trim();
  return (
    message === "teamver_drive_main_sso_user_mismatch"
    || message === "main_sso_user_mismatch"
  );
}

/** Main SSO gate that needs parent-domain re-login (expired or wrong account). */
export function isTeamverDriveMainSsoGateError(err: unknown): boolean {
  return isTeamverDriveMainSsoRequiredError(err) || isTeamverDriveMainSsoUserMismatchError(err);
}

export async function getTeamverDriveJson(
  path: string,
  workspaceId?: string | null,
  options?: TeamverDriveFetchOptions,
): Promise<unknown> {
  const response = await teamverDriveFetch(
    path,
    { method: "GET", signal: options?.signal },
    workspaceId,
  );
  if (!response.ok) {
    const body = await readDriveErrorBody(response);
    throw new Error(driveErrorCodeForStatus(response.status, body));
  }
  const raw = await response.json();
  return snakeToCamelDeep(raw);
}

export async function postTeamverDriveJson(
  path: string,
  body: unknown,
  workspaceId?: string | null,
  options?: TeamverDriveFetchOptions,
): Promise<unknown> {
  const response = await teamverDriveFetch(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    },
    workspaceId,
  );
  if (!response.ok) {
    const errBody = await readDriveErrorBody(response);
    throw new Error(driveErrorCodeForStatus(response.status, errBody));
  }
  const raw = await response.json();
  return snakeToCamelDeep(raw);
}

export function isTeamverDriveAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof Error && err.name === "AbortError";
}

export function extractTeamverDriveItems<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const data = obj.data;
  if (Array.isArray(data)) return data as T[];
  for (const key of ["items", "results", "list", "drives", "sharedDrives"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === "object") {
      const nested = extractTeamverDriveItems<T>(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

/** @internal vitest */
export function resetTeamverDriveFetchQueueForTests(): void {
  driveFetchActive = 0;
  driveFetchWaiters.length = 0;
}
