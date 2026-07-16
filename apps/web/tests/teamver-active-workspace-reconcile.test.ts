// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const storeSetMock = vi.fn(async () => undefined);
const storeGetMock = vi.fn(async () => "WS-picked");

vi.mock("../src/teamver/designBffClient", () => ({
  fetchDesignAuthSession: vi.fn(async () => ({
    authenticated: true,
    user: { userId: "user-1" },
    defaultWorkspaceId: "WS-default",
    workspaces: [
      { id: "WS-picked", name: "테스트", role: "owner" },
      { id: "WS-default", name: "뉴럴스튜디오", role: "owner" },
    ],
  })),
  getDesignBffClient: vi.fn(() => ({
    workspaceStore: {
      get: storeGetMock,
      set: storeSetMock,
      setLastForUser: vi.fn(),
    },
  })),
  readCachedDesignAuthSessionMeta: vi.fn(() => ({
    fetchedAt: 9_999,
    defaultWorkspaceId: "WS-default",
  })),
}));

vi.mock("../src/teamver/syncTeamverWorkspace", () => ({
  syncTeamverWorkspaceFromSession: vi.fn(async () => "WS-default"),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

import { syncTeamverWorkspaceFromSession } from "../src/teamver/syncTeamverWorkspace";
import { resolveActiveTeamverWorkspaceId } from "../src/teamver/activeTeamverWorkspace";

describe("resolveActiveTeamverWorkspaceId", () => {
  beforeEach(() => {
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue("WS-picked");
    storeSetMock.mockClear();
    vi.mocked(syncTeamverWorkspaceFromSession).mockClear();
    vi.mocked(syncTeamverWorkspaceFromSession).mockResolvedValue("WS-default");
    localStorage.removeItem("teamver_design_workspace_store_revision_ms");
  });

  it("keeps an explicit store pick on hard refresh even when session default differs", async () => {
    // Session probe always looks "newer" than an older revision after reload.
    localStorage.setItem("teamver_design_workspace_store_revision_ms", "1000");
    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe("WS-picked");
    expect(syncTeamverWorkspaceFromSession).not.toHaveBeenCalled();
  });

  it("keeps store pick when revision is newer than any cached session probe", async () => {
    localStorage.setItem("teamver_design_workspace_store_revision_ms", "50_000");
    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe("WS-picked");
    expect(syncTeamverWorkspaceFromSession).not.toHaveBeenCalled();
  });

  it("reconciles via sync when stored id is absent from the session list", async () => {
    storeGetMock.mockResolvedValue("WS-revoked");
    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe("WS-default");
    expect(syncTeamverWorkspaceFromSession).toHaveBeenCalled();
  });
});
