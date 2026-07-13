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
export function shouldSkipDriveAuthRefresh(detail: unknown): boolean {
  if (typeof detail !== "string") return false;
  const normalized = detail.trim().toLowerCase();
  if (normalized === "session_expired") return true;
  if (normalized === "unauthorized") return true;
  if (normalized.includes("invalid token")) return true;
  if (normalized.includes("error.authentication")) return true;
  return false;
}

async function teamverDriveFetch(
  path: string,
  init: RequestInit,
  workspaceId?: string | null,
): Promise<Response> {
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
  if (response.status === 401 || response.status === 403) {
    const body = await response.clone().json().catch(() => null);
    const detail = body && typeof body === "object" ? (body as Record<string, unknown>).detail : null;
    if (shouldSkipDriveAuthRefresh(detail)) {
      return response;
    }
    const refreshed = await refreshDesignAuthCookie();
    if (refreshed) response = await doFetch();
  }
  return response;
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
