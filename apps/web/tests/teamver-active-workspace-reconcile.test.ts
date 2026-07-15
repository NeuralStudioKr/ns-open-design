// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const storeSetMock = vi.fn(async () => undefined);
const storeGetMock = vi.fn(async () => "WS-stale");

vi.mock("../src/teamver/designBffClient", () => ({
  fetchDesignAuthSession: vi.fn(async () => ({
    authenticated: true,
    user: { userId: "user-1" },
    defaultWorkspaceId: "WS-current",
    workspaces: [
      { id: "WS-stale", name: "테스트", role: "owner" },
      { id: "WS-current", name: "뉴럴스튜디오", role: "owner" },
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
    fetchedAt: 2_000,
    defaultWorkspaceId: "WS-current",
  })),
}));

vi.mock("../src/teamver/syncTeamverWorkspace", () => ({
  syncTeamverWorkspaceFromSession: vi.fn(async () => "WS-current"),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

import { readCachedDesignAuthSessionMeta } from "../src/teamver/designBffClient";
import { syncTeamverWorkspaceFromSession } from "../src/teamver/syncTeamverWorkspace";
import { resolveActiveTeamverWorkspaceId } from "../src/teamver/activeTeamverWorkspace";

describe("resolveActiveTeamverWorkspaceId", () => {
  beforeEach(() => {
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue("WS-stale");
    storeSetMock.mockClear();
    vi.mocked(syncTeamverWorkspaceFromSession).mockClear();
    vi.mocked(syncTeamverWorkspaceFromSession).mockResolvedValue("WS-current");
    localStorage.removeItem("teamver_design_workspace_store_revision_ms");
    vi.mocked(readCachedDesignAuthSessionMeta).mockReturnValue({
      fetchedAt: 2_000,
      defaultWorkspaceId: "WS-current",
    });
  });

  it("reconciles to session default when embed store is older than session probe", async () => {
    localStorage.setItem("teamver_design_workspace_store_revision_ms", "1000");
    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe("WS-current");
    expect(syncTeamverWorkspaceFromSession).toHaveBeenCalledWith(
      expect.objectContaining({ defaultWorkspaceId: "WS-current" }),
      expect.any(Array),
      expect.objectContaining({
        preferredIdOverride: "WS-current",
        preserveStoredWorkspace: false,
      }),
    );
  });

  it("keeps explicit embed workspace pick when store revision is newer than session probe", async () => {
    localStorage.setItem("teamver_design_workspace_store_revision_ms", "5000");
    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe("WS-stale");
    expect(syncTeamverWorkspaceFromSession).not.toHaveBeenCalled();
  });
});
