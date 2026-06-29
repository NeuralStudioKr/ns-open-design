import { isTeamverEmbedMode } from "./designApiBase";
import { readActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";

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

/** Embed active workspace for daemon `/api/*` — aligns run usage/billing with BFF headers. */
export async function buildTeamverDaemonRequestHeaders(
  base: Record<string, string>,
): Promise<Record<string, string>> {
  if (!isTeamverEmbedMode()) return base;
  const workspaceId = await readActiveTeamverWorkspaceId();
  if (!workspaceId) return base;
  return { ...base, "X-Workspace-Id": workspaceId };
}

/** fetch wrapper — embed mode forwards active workspace so nginx/daemon access matches BFF registry. */
export async function fetchTeamverDaemon(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = await buildTeamverDaemonRequestHeaders(headersInitToRecord(init.headers));
  return fetch(input, { ...init, headers });
}
