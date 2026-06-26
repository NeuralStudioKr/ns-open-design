import type { LocalStorageWorkspaceStore } from "@teamver/app-sdk";
import { getDesignBffClient } from "./designBffClient";
import { dispatchTeamverWorkspaceChanged } from "./teamverWorkspaceEvents";
import { bumpTeamverWorkspaceStoreRevision } from "./teamverWorkspaceStoreRevision";

export async function setActiveTeamverWorkspace(
  workspaceId: string,
  userId?: string | null,
): Promise<void> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return;

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return;

  await store.set(trimmed);
  bumpTeamverWorkspaceStoreRevision();
  if (userId?.trim() && typeof store.setLastForUser === "function") {
    store.setLastForUser(userId.trim(), trimmed);
  }
  dispatchTeamverWorkspaceChanged(trimmed);
}
