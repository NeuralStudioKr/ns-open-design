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

/** Limit concurrent Drive BFF calls (browse/recent/thumbs) without full serialization. */
const DRIVE_FETCH_MAX_CONCURRENT = 4;
let driveFetchActive = 0;
const driveFetchWaiters: Array<() => void> = [];

async function acquireDriveFetchSlot(): Promise<void> {
  if (driveFetchActive < DRIVE_FETCH_MAX_CONCURRENT) {
    driveFetchActive += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    driveFetchWaiters.push(resolve);
  });
  driveFetchActive += 1;
}

function releaseDriveFetchSlot(): void {
  driveFetchActive = Math.max(0, driveFetchActive - 1);
  const next = driveFetchWaiters.shift();
  if (next) next();
}

function enqueueDriveFetch<T>(run: () => Promise<T>): Promise<T> {
  return (async () => {
    await acquireDriveFetchSlot();
    try {
      return await run();
    } finally {
      releaseDriveFetchSlot();
    }
  })();
}

const DRIVE_AUTH_RETRY_DELAY_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
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
      // Soft retry only: Apps /auth/refresh cannot revive Main HS256 SSO
      // (`teamver_access_token`) that Drive proxy forwards. Another sibling may
      // have just written cookies — wait briefly once, then surface 401.
      await delay(DRIVE_AUTH_RETRY_DELAY_MS);
      return doFetch();
    }

    const recovered = await recoverDriveAuthSession();
    if (recovered) response = await doFetch();
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
  driveFetchActive = 0;
  driveFetchWaiters.length = 0;
}
