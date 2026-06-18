import type { WorkspaceListItem } from "@teamver/app-sdk";

type WorkspaceLike = {
  id?: string | null;
  workspaceId?: string | null;
  name?: string | null;
  displayName?: string | null;
  code?: string | null;
  role?: WorkspaceListItem["role"] | null;
  workspaceKind?: string | null;
  isAccountDefaultWorkspace?: boolean | null;
  appEnabled?: boolean | null;
  appDisabledReason?: string | null;
};

export function readWorkspaceId(workspace: WorkspaceLike | null | undefined): string | null {
  const id = workspace?.id?.trim() || workspace?.workspaceId?.trim() || null;
  return id || null;
}

export function readWorkspaceLabel(workspace: WorkspaceLike | null | undefined): string {
  const name =
    workspace?.name?.trim() ||
    workspace?.displayName?.trim() ||
    workspace?.code?.trim() ||
    readWorkspaceId(workspace) ||
    "Workspace";
  return name;
}

export function workspaceInitial(workspace: WorkspaceLike | null | undefined): string {
  const label = readWorkspaceLabel(workspace);
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return (label.slice(0, 2) || "WS").toUpperCase();
}

export function isAccountDefaultWorkspace(workspace: WorkspaceLike): boolean {
  return Boolean(workspace.isAccountDefaultWorkspace);
}

export function isWorkspaceAppEnabled(workspace: WorkspaceLike): boolean {
  return workspace.appEnabled !== false;
}

export function readAppDisabledReason(workspace: WorkspaceLike | null | undefined): string | null {
  const reason = workspace?.appDisabledReason?.trim() || null;
  return reason || null;
}

export function formatWorkspaceMenuLabel(
  workspace: WorkspaceLike,
  disabledHint = "Disabled",
): string {
  const label = readWorkspaceLabel(workspace);
  return isWorkspaceAppEnabled(workspace) ? label : `${label} (${disabledHint})`;
}

export function normalizeWorkspaceList(
  workspaces: WorkspaceLike[] | undefined | null,
): WorkspaceListItem[] {
  const seen = new Set<string>();
  const normalized: WorkspaceListItem[] = [];
  for (const workspace of workspaces ?? []) {
    const id = readWorkspaceId(workspace);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      ...workspace,
      id,
      name: readWorkspaceLabel(workspace),
      role: workspace.role ?? "member",
      workspaceKind: workspace.workspaceKind ?? undefined,
      isAccountDefaultWorkspace: isAccountDefaultWorkspace(workspace),
      appEnabled: isWorkspaceAppEnabled(workspace),
      appDisabledReason: readAppDisabledReason(workspace),
    });
  }
  return normalized;
}

export function pickDefaultWorkspaceId(
  workspaces: WorkspaceListItem[],
  options?: {
    preferredId?: string | null;
    defaultWorkspaceId?: string | null;
  },
): string | null {
  const enabled = workspaces.filter(isWorkspaceAppEnabled);
  const pool = enabled.length > 0 ? enabled : workspaces;
  if (pool.length === 0) return null;

  const preferred = options?.preferredId?.trim();
  if (preferred && pool.some((workspace) => readWorkspaceId(workspace) === preferred)) {
    return preferred;
  }

  const defaultId = options?.defaultWorkspaceId?.trim();
  if (defaultId && pool.some((workspace) => readWorkspaceId(workspace) === defaultId)) {
    return defaultId;
  }

  const accountDefault = pool.find(isAccountDefaultWorkspace);
  const fromAccountDefault = readWorkspaceId(accountDefault);
  if (fromAccountDefault) return fromAccountDefault;

  return readWorkspaceId(pool[0]);
}
