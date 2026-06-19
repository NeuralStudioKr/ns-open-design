import { snakeToCamelDeep } from "@teamver/app-sdk";
import { resolveTeamverMainApiBaseUrl } from "./designApiBase";

export function teamverDriveApiUrl(path: string): string {
  return `${resolveTeamverMainApiBaseUrl().replace(/\/+$/, "")}${path}`;
}

export async function getTeamverDriveJson(path: string, workspaceId?: string | null): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const trimmedWorkspaceId = workspaceId?.trim();
  if (trimmedWorkspaceId) headers["X-Workspace-Id"] = trimmedWorkspaceId;
  const response = await fetch(teamverDriveApiUrl(path), {
    credentials: "include",
    headers,
  });
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
