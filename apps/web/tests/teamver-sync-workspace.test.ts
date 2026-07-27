// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEAMVER_WORKSPACE_CHANGED_EVENT } from "../src/teamver/teamverWorkspaceEvents";

const storeSetMock = vi.fn(async () => undefined);
const storeGetMock = vi.fn(async () => null);
const storeGetPreferredMock = vi.fn(() => null as string | null);

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    workspaceStore: {
      get: storeGetMock,
      set: storeSetMock,
      setLastForUser: vi.fn(),
      getPreferredWorkspaceIdForBootstrap: storeGetPreferredMock,
    },
  })),
}));

import { syncTeamverWorkspaceFromSession } from "../src/teamver/syncTeamverWorkspace";

describe("syncTeamverWorkspaceFromSession", () => {
  beforeEach(() => {
    storeSetMock.mockClear();
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue(null);
    storeGetPreferredMock.mockReset();
    storeGetPreferredMock.mockReturnValue(null);
  });

  it("dispatches workspace-changed when bootstrap resolves a new active id", async () => {
    const events: string[] = [];
    window.addEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, (event) => {
      events.push(
        (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId ?? "",
      );
    });

    const active = await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-2",
        workspaces: [
          { id: "WS-1", name: "Alpha", role: "owner" },
          { id: "WS-2", name: "Beta", role: "member" },
        ],
      },
      [
        { id: "WS-1", name: "Alpha", role: "owner" },
        { id: "WS-2", name: "Beta", role: "member" },
      ],
    );

    expect(active).toBe("WS-2");
    expect(storeSetMock).toHaveBeenCalledWith("WS-2");
    expect(events).toContain("WS-2");
  });

  it("does not dispatch when active workspace already matches resolved id", async () => {
    storeGetMock.mockResolvedValue("WS-1");
    const events: string[] = [];
    window.addEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, (event) => {
      events.push(
        (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId ?? "",
      );
    });

    const active = await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-1",
        workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
      },
      [{ id: "WS-1", name: "Alpha", role: "owner" }],
    );

    expect(active).toBe("WS-1");
    expect(storeSetMock).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("preferredIdOverride wins over stale store (parent workspace switch)", async () => {
    storeGetMock.mockResolvedValue("WS-old");
    const events: string[] = [];
    window.addEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, (event) => {
      events.push(
        (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId ?? "",
      );
    });

    const active = await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-new",
        workspaces: [
          { id: "WS-old", name: "Old", role: "owner" },
          { id: "WS-new", name: "New", role: "owner" },
        ],
      },
      [
        { id: "WS-old", name: "Old", role: "owner" },
        { id: "WS-new", name: "New", role: "owner" },
      ],
      { preferredIdOverride: "WS-new" },
    );

    expect(active).toBe("WS-new");
    expect(storeSetMock).toHaveBeenCalledWith("WS-new");
    expect(events).toContain("WS-new");
  });

  it("keeps stale store when override is not provided", async () => {
    storeGetMock.mockResolvedValue("WS-old");

    const active = await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-new",
        workspaces: [
          { id: "WS-old", name: "Old", role: "owner" },
          { id: "WS-new", name: "New", role: "owner" },
        ],
      },
      [
        { id: "WS-old", name: "Old", role: "owner" },
        { id: "WS-new", name: "New", role: "owner" },
      ],
    );

    expect(active).toBe("WS-old");
    expect(storeSetMock).not.toHaveBeenCalled();
  });

  it("preserveStoredWorkspace pins the stored id when the workspace is disabled but still listed", async () => {
    storeGetMock.mockResolvedValue("WS-current");
    const events: string[] = [];
    window.addEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, (event) => {
      events.push(
        (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId ?? "",
      );
    });

    // Design app disabled on the currently-active workspace — a naive resync
    // would fall through to the account default and reroute the entire embed.
    const active = await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-other",
        workspaces: [
          { id: "WS-current", name: "Current", role: "owner", appEnabled: false },
          { id: "WS-other", name: "Other", role: "owner", appEnabled: true },
        ],
      },
      [
        { id: "WS-current", name: "Current", role: "owner", appEnabled: false },
        { id: "WS-other", name: "Other", role: "owner", appEnabled: true },
      ],
      { preserveStoredWorkspace: true },
    );

    expect(active).toBe("WS-current");
    expect(storeSetMock).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("preserveStoredWorkspace still reconciles when the stored workspace is revoked entirely", async () => {
    storeGetMock.mockResolvedValue("WS-revoked");
    const events: string[] = [];
    window.addEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, (event) => {
      events.push(
        (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId ?? "",
      );
    });

    const active = await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-current",
        workspaces: [{ id: "WS-current", name: "Current", role: "owner" }],
      },
      [{ id: "WS-current", name: "Current", role: "owner" }],
      { preserveStoredWorkspace: true },
    );

    expect(active).toBe("WS-current");
    expect(storeSetMock).toHaveBeenCalledWith("WS-current");
    expect(events).toContain("WS-current");
  });

  it("falls back to last-by-user when stored id is absent from the session list", async () => {
    storeGetMock.mockResolvedValue("WS-gone");
    storeGetPreferredMock.mockReturnValue("WS-last");

    const active = await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-default",
        workspaces: [
          { id: "WS-last", name: "Last", role: "owner" },
          { id: "WS-default", name: "Default", role: "owner" },
        ],
      },
      [
        { id: "WS-last", name: "Last", role: "owner" },
        { id: "WS-default", name: "Default", role: "owner" },
      ],
    );

    expect(active).toBe("WS-last");
    expect(storeSetMock).toHaveBeenCalledWith("WS-last");
  });
});
