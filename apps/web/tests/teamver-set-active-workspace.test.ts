// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postDesignAuthWorkspaceMock = vi.fn();
const refreshDesignAuthCookieMock = vi.fn();
const ensureDesignBffSessionAuthenticatedMock = vi.fn();
const isBootstrapAuthModeMock = vi.fn(() => true);
const workspaceStoreSet = vi.fn();
const dispatchWorkspaceChanged = vi.fn();
const bumpRevision = vi.fn();

vi.mock("../src/teamver/designAuthClient", () => ({
  postDesignAuthWorkspace: (id: string) => postDesignAuthWorkspaceMock(id),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: () => ({
    workspaceStore: {
      set: (id: string) => workspaceStoreSet(id),
    },
  }),
  refreshDesignAuthCookie: () => refreshDesignAuthCookieMock(),
  ensureDesignBffSessionAuthenticated: () => ensureDesignBffSessionAuthenticatedMock(),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isBootstrapAuthMode: () => isBootstrapAuthModeMock(),
}));

vi.mock("../src/teamver/teamverWorkspaceEvents", () => ({
  dispatchTeamverWorkspaceChanged: (id: string) => dispatchWorkspaceChanged(id),
}));

vi.mock("../src/teamver/teamverWorkspaceStoreRevision", () => ({
  bumpTeamverWorkspaceStoreRevision: () => bumpRevision(),
}));

describe("setActiveTeamverWorkspace recovery ladder", () => {
  beforeEach(() => {
    postDesignAuthWorkspaceMock.mockReset();
    refreshDesignAuthCookieMock.mockReset();
    ensureDesignBffSessionAuthenticatedMock.mockReset();
    workspaceStoreSet.mockReset();
    dispatchWorkspaceChanged.mockReset();
    bumpRevision.mockReset();
    isBootstrapAuthModeMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not attempt refresh recovery on non-auth failures", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    postDesignAuthWorkspaceMock.mockRejectedValue({ status: 500, detail: "boom" });

    await setActiveTeamverWorkspace("ws-1");

    expect(refreshDesignAuthCookieMock).not.toHaveBeenCalled();
    expect(ensureDesignBffSessionAuthenticatedMock).not.toHaveBeenCalled();
    // Local store still updates so the switch is visible in the UI.
    expect(workspaceStoreSet).toHaveBeenCalledWith("ws-1");
    expect(dispatchWorkspaceChanged).toHaveBeenCalledWith("ws-1");
  });

  it("retries after refresh when workspace POST returns 401", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    postDesignAuthWorkspaceMock
      .mockRejectedValueOnce({ status: 401, code: "session_expired" })
      .mockResolvedValueOnce(undefined);
    refreshDesignAuthCookieMock.mockResolvedValue(true);

    await setActiveTeamverWorkspace("ws-2");

    expect(refreshDesignAuthCookieMock).toHaveBeenCalledTimes(1);
    expect(postDesignAuthWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(workspaceStoreSet).toHaveBeenCalledWith("ws-2");
  });

  it("escalates to ensure /auth/session when refresh cannot recover", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    postDesignAuthWorkspaceMock
      .mockRejectedValueOnce({ status: 401 })
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce(undefined);
    refreshDesignAuthCookieMock.mockResolvedValue(true);
    ensureDesignBffSessionAuthenticatedMock.mockResolvedValue(true);

    await setActiveTeamverWorkspace("ws-3");

    expect(refreshDesignAuthCookieMock).toHaveBeenCalledTimes(1);
    expect(ensureDesignBffSessionAuthenticatedMock).toHaveBeenCalledTimes(1);
    expect(postDesignAuthWorkspaceMock).toHaveBeenCalledTimes(3);
    expect(workspaceStoreSet).toHaveBeenCalledWith("ws-3");
  });

  it("does not advance local store when server refuses after all recovery attempts", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    postDesignAuthWorkspaceMock.mockRejectedValue({ status: 401 });
    refreshDesignAuthCookieMock.mockResolvedValue(false);
    ensureDesignBffSessionAuthenticatedMock.mockResolvedValue(false);

    await setActiveTeamverWorkspace("ws-4");

    // Auth ladder exhausted — no 4th POST; local store must not drift.
    expect(postDesignAuthWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(workspaceStoreSet).not.toHaveBeenCalled();
    expect(dispatchWorkspaceChanged).not.toHaveBeenCalled();
  });

  it("skips the BFF POST entirely when not in bootstrap auth mode", async () => {
    isBootstrapAuthModeMock.mockReturnValue(false);
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );

    await setActiveTeamverWorkspace("ws-5");

    expect(postDesignAuthWorkspaceMock).not.toHaveBeenCalled();
    expect(workspaceStoreSet).toHaveBeenCalledWith("ws-5");
  });
});
