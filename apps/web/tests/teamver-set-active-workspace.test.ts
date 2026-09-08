// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postDesignAuthWorkspaceMock = vi.fn();
// The bare refresh + ensure pair became one `ensureDesignAuthLadder(tag, opts)`
// with the rung selected by `opts.mode`. Split it back into two spies so each
// rung keeps its own call count.
const ladderRefreshMock = vi.fn();
const ladderEnsureMock = vi.fn();
const shouldSkipTeamverBffAuthCallsMock = vi.fn(() => false);
const isDesignAuthRefreshDeclinedMock = vi.fn(() => false);
const isBootstrapAuthModeMock = vi.fn(() => true);
const workspaceStoreSet = vi.fn();
const workspaceStoreGet = vi.fn<() => string | null>(() => null);
const dispatchWorkspaceChanged = vi.fn();
const bumpRevision = vi.fn();

vi.mock("../src/teamver/designAuthClient", () => ({
  postDesignAuthWorkspace: (id: string) => postDesignAuthWorkspaceMock(id),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: () => ({
    workspaceStore: {
      set: (id: string) => workspaceStoreSet(id),
      get: () => workspaceStoreGet(),
    },
  }),
  ensureDesignAuthLadder: (tag: string, options?: { mode?: string }) =>
    options?.mode === "ensure" ? ladderEnsureMock(tag) : ladderRefreshMock(tag),
  shouldSkipTeamverBffAuthCalls: () => shouldSkipTeamverBffAuthCallsMock(),
  isDesignAuthRefreshDeclined: () => isDesignAuthRefreshDeclinedMock(),
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
    ladderRefreshMock.mockReset();
    ladderEnsureMock.mockReset();
    shouldSkipTeamverBffAuthCallsMock.mockReset();
    shouldSkipTeamverBffAuthCallsMock.mockReturnValue(false);
    isDesignAuthRefreshDeclinedMock.mockReset();
    isDesignAuthRefreshDeclinedMock.mockReturnValue(false);
    workspaceStoreSet.mockReset();
    workspaceStoreGet.mockReset();
    workspaceStoreGet.mockReturnValue(null);
    dispatchWorkspaceChanged.mockReset();
    bumpRevision.mockReset();
    isBootstrapAuthModeMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not advance local store on non-auth BFF failures", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    postDesignAuthWorkspaceMock.mockRejectedValue({ status: 500, detail: "boom" });

    const ok = await setActiveTeamverWorkspace("ws-1");

    expect(ok).toBe(false);
    expect(ladderRefreshMock).not.toHaveBeenCalled();
    expect(ladderEnsureMock).not.toHaveBeenCalled();
    expect(workspaceStoreSet).not.toHaveBeenCalled();
    expect(dispatchWorkspaceChanged).not.toHaveBeenCalled();
  });

  it("retries after refresh when workspace POST returns 401", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    postDesignAuthWorkspaceMock
      .mockRejectedValueOnce({ status: 401, code: "session_expired" })
      .mockResolvedValueOnce(undefined);
    ladderRefreshMock.mockResolvedValue(true);

    const ok = await setActiveTeamverWorkspace("ws-2");

    expect(ok).toBe(true);
    expect(ladderRefreshMock).toHaveBeenCalledTimes(1);
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
    ladderRefreshMock.mockResolvedValue(true);
    ladderEnsureMock.mockResolvedValue(true);

    const ok = await setActiveTeamverWorkspace("ws-3");

    expect(ok).toBe(true);
    expect(ladderRefreshMock).toHaveBeenCalledTimes(1);
    expect(ladderEnsureMock).toHaveBeenCalledTimes(1);
    expect(postDesignAuthWorkspaceMock).toHaveBeenCalledTimes(3);
    expect(workspaceStoreSet).toHaveBeenCalledWith("ws-3");
  });

  it("does not advance local store when server refuses after all recovery attempts", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    postDesignAuthWorkspaceMock.mockRejectedValue({ status: 401 });
    ladderRefreshMock.mockResolvedValue(false);
    ladderEnsureMock.mockResolvedValue(false);

    const ok = await setActiveTeamverWorkspace("ws-4");

    expect(ok).toBe(false);
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

    const ok = await setActiveTeamverWorkspace("ws-5");

    expect(ok).toBe(true);
    expect(postDesignAuthWorkspaceMock).not.toHaveBeenCalled();
    expect(workspaceStoreSet).toHaveBeenCalledWith("ws-5");
  });

  it("retries after refresh when BFF returns nested token_expired envelope", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    // Production-shaped body after exception-handler fix (and status from client).
    postDesignAuthWorkspaceMock
      .mockRejectedValueOnce({
        status: 401,
        error: {
          code: "token_expired",
          message: "Session expired",
          login_url: "https://teamver.com/auth/signin?app_id=teamver-design",
        },
      })
      .mockResolvedValueOnce(undefined);
    ladderRefreshMock.mockResolvedValue(true);

    const ok = await setActiveTeamverWorkspace("ws-nested");

    expect(ok).toBe(true);
    expect(ladderRefreshMock).toHaveBeenCalledTimes(1);
    expect(postDesignAuthWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(workspaceStoreSet).toHaveBeenCalledWith("ws-nested");
  });

  it("retries after refresh when legacy mangled unauthorized envelope appears", async () => {
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );
    // Pre-fix handler: code=unauthorized, message=str(auth_error_body dict)
    postDesignAuthWorkspaceMock
      .mockRejectedValueOnce({
        status: 401,
        error: {
          code: "unauthorized",
          message:
            "{'error': {'code': 'token_expired', 'message': 'Session expired', 'request_id': 'AUTH-3086D0', 'retryable': False}}",
        },
      })
      .mockResolvedValueOnce(undefined);
    ladderRefreshMock.mockResolvedValue(true);

    const ok = await setActiveTeamverWorkspace("ws-mangled");

    expect(ok).toBe(true);
    expect(ladderRefreshMock).toHaveBeenCalledTimes(1);
    expect(postDesignAuthWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(workspaceStoreSet).toHaveBeenCalledWith("ws-mangled");
  });

  it("skips workspace switch when sticky / logged-out auth gate is active", async () => {
    shouldSkipTeamverBffAuthCallsMock.mockReturnValue(true);
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );

    const ok = await setActiveTeamverWorkspace("ws-6");

    expect(ok).toBe(false);
    expect(postDesignAuthWorkspaceMock).not.toHaveBeenCalled();
    expect(ladderRefreshMock).not.toHaveBeenCalled();
    expect(workspaceStoreSet).not.toHaveBeenCalled();
  });

  it("skips workspace switch while soft sticky owns recovery", async () => {
    isDesignAuthRefreshDeclinedMock.mockReturnValue(true);
    shouldSkipTeamverBffAuthCallsMock.mockReturnValue(false);
    const { setActiveTeamverWorkspace } = await import(
      "../src/teamver/setActiveTeamverWorkspace"
    );

    const ok = await setActiveTeamverWorkspace("ws-7");

    expect(ok).toBe(false);
    expect(postDesignAuthWorkspaceMock).not.toHaveBeenCalled();
    expect(ladderRefreshMock).not.toHaveBeenCalled();
    expect(workspaceStoreSet).not.toHaveBeenCalled();
  });

  describe("boot realign (0908-N01 slice E)", () => {
    it("re-asserts the workspace to the BFF without announcing a change", async () => {
      workspaceStoreGet.mockReturnValue("ws-boot");
      postDesignAuthWorkspaceMock.mockResolvedValue(undefined);
      const { setActiveTeamverWorkspace } = await import(
        "../src/teamver/setActiveTeamverWorkspace"
      );

      const ok = await setActiveTeamverWorkspace("ws-boot", "user-1", {
        skipEventWhenUnchanged: true,
      });

      expect(ok).toBe(true);
      // The point of the realign: the cookie hears about it.
      expect(postDesignAuthWorkspaceMock).toHaveBeenCalledWith("ws-boot");
      // But nothing moved, so no refresh may replay the switch side effects.
      expect(dispatchWorkspaceChanged).not.toHaveBeenCalled();
    });

    it("still announces when the realign actually moves the workspace", async () => {
      workspaceStoreGet.mockReturnValue("ws-old");
      postDesignAuthWorkspaceMock.mockResolvedValue(undefined);
      const { setActiveTeamverWorkspace } = await import(
        "../src/teamver/setActiveTeamverWorkspace"
      );

      const ok = await setActiveTeamverWorkspace("ws-new", "user-1", {
        skipEventWhenUnchanged: true,
      });

      expect(ok).toBe(true);
      expect(dispatchWorkspaceChanged).toHaveBeenCalledWith("ws-new");
    });

    it("announces every explicit switch, even onto the same workspace", async () => {
      workspaceStoreGet.mockReturnValue("ws-same");
      postDesignAuthWorkspaceMock.mockResolvedValue(undefined);
      const { setActiveTeamverWorkspace } = await import(
        "../src/teamver/setActiveTeamverWorkspace"
      );

      const ok = await setActiveTeamverWorkspace("ws-same", "user-1");

      expect(ok).toBe(true);
      expect(dispatchWorkspaceChanged).toHaveBeenCalledWith("ws-same");
    });
  });
});
