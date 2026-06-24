// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEAMVER_WORKSPACE_CHANGED_EVENT } from "../src/teamver/teamverWorkspaceEvents";

const storeSetMock = vi.fn(async () => undefined);
const storeGetMock = vi.fn(async () => null);

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    workspaceStore: {
      get: storeGetMock,
      set: storeSetMock,
      setLastForUser: vi.fn(),
    },
  })),
}));

import { syncTeamverWorkspaceFromSession } from "../src/teamver/syncTeamverWorkspace";

describe("syncTeamverWorkspaceFromSession", () => {
  beforeEach(() => {
    storeSetMock.mockClear();
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue(null);
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
});
