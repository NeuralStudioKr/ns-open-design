import { snakeToCamelDeep } from "@teamver/app-sdk";
import { resolveTeamverDriveBffBase } from "./designApiBase";
import { fetchDesignAuthSession, refreshDesignAuthCookie } from "./designBffClient";

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
  return false;
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

const DRIVE_AUTH_RETRY_DELAY_MS = 150;

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

async function recoverDriveAuthSession(): Promise<boolean> {
  const refreshed = await refreshDesignAuthCookie();
  if (refreshed) return true;

  // Drive modal open is an explicit user action. If a previous background
  // refresh left the BFF client in sticky-decline state, force one fresh session
  // probe before surfacing "Drive session expired". This also covers HA cases
  // where another response already Set-Cookie'd a usable BFF session.
  try {
    const session = await fetchDesignAuthSession({ force: true, resetRefreshState: true });
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
    const trimmedWorkspaceId = workspaceId?.trim();
    if (trimmedWorkspaceId) headers.set("X-Workspace-Id", trimmedWorkspaceId);

    const doFetch = () =>
      fetch(teamverDriveApiUrl(path), {
        ...init,
        credentials: "include",
        headers,
        signal,
      });

    let response = await doFetch();
    throwIfDriveAborted(signal);
    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    const body = await response.clone().json().catch(() => null);
    const detail = extractDriveAuthBodyText(body);

    // Workspace ACL 403: do not soft-retry or call Apps /auth/refresh.
    if (response.status === 403 && isDriveWorkspaceForbiddenBody(detail)) {
      return response;
    }

    if (shouldSkipDriveAuthRefresh(detail)) {
      // Soft retry only: Apps /auth/refresh cannot revive Main HS256 SSO
      // (`teamver_access_token`) that Drive proxy forwards. Another sibling may
      // have just written cookies — wait briefly once, then surface 401.
      await delay(DRIVE_AUTH_RETRY_DELAY_MS, signal);
      throwIfDriveAborted(signal);
      return doFetch();
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
    throw new Error(`teamver_drive_fetch_failed:${response.status}`);
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
    throw new Error(`teamver_drive_fetch_failed:${response.status}`);
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
