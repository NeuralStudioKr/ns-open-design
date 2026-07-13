import { snakeToCamelDeep } from "@teamver/app-sdk";
import { resolveTeamverDriveBffBase } from "./designApiBase";
import { refreshDesignAuthCookie } from "./designBffClient";

export function teamverDriveApiUrl(path: string): string {
  const suffix = path.replace(/^\//, "");
  return `${resolveTeamverDriveBffBase().replace(/\/+$/, "")}/${suffix}`;
}

/**
 * True when a Drive BFF 401/403 body means "do not call /auth/refresh".
 * BFF already force-refreshed on upstream Invalid token, and nginx/session
 * expiry bodies only create refresh-token rotation races if retried here.
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
  }
  return null;
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
  return false;
}

/** Serialize Drive BFF calls so parallel modal opens cannot multi-node refresh-race. */
let driveFetchTail: Promise<void> = Promise.resolve();

function enqueueDriveFetch<T>(run: () => Promise<T>): Promise<T> {
  const result = driveFetchTail.then(run, run);
  driveFetchTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const DRIVE_AUTH_RETRY_DELAY_MS = 280;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function teamverDriveFetch(
  path: string,
  init: RequestInit,
  workspaceId?: string | null,
): Promise<Response> {
  return enqueueDriveFetch(async () => {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const trimmedWorkspaceId = workspaceId?.trim();
    if (trimmedWorkspaceId) headers.set("X-Workspace-Id", trimmedWorkspaceId);

    const doFetch = () =>
      fetch(teamverDriveApiUrl(path), {
        ...init,
        credentials: "include",
        headers,
      });

    let response = await doFetch();
    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    const body = await response.clone().json().catch(() => null);
    const detail =
      body && typeof body === "object" ? (body as Record<string, unknown>).detail : null;

    if (shouldSkipDriveAuthRefresh(detail)) {
      // Sibling Drive/BFF call may have just rotated the session cookie. Wait
      // briefly and retry once without POSTing /auth/refresh again.
      await delay(DRIVE_AUTH_RETRY_DELAY_MS);
      response = await doFetch();
      return response;
    }

    const refreshed = await refreshDesignAuthCookie();
    if (refreshed) response = await doFetch();
    return response;
  });
}

export async function getTeamverDriveJson(path: string, workspaceId?: string | null): Promise<unknown> {
  const response = await teamverDriveFetch(path, { method: "GET" }, workspaceId);
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
): Promise<unknown> {
  const response = await teamverDriveFetch(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    workspaceId,
  );
  if (!response.ok) {
    throw new Error(`teamver_drive_fetch_failed:${response.status}`);
  }
  const raw = await response.json();
  return snakeToCamelDeep(raw);
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
  driveFetchTail = Promise.resolve();
}
