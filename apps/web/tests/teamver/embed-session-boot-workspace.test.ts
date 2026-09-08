// @vitest-environment jsdom
/**
 * Behavioural cover for the 0908-N01 P1 precedence rule inside
 * `runTeamverEmbedSessionBoot`. The sibling `embed-session-boot.test.ts` only
 * matches source text, which cannot catch a wrong argument or a missing await —
 * so the workspace decision itself is asserted here through the collaborators.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchDesignAuthSession: vi.fn(),
  ensureDesignAuthLadder: vi.fn(),
  fetchTeamverRuntimeConfig: vi.fn(),
  consumeLaunchWorkspaceIdHint: vi.fn(),
  readStoredWorkspaceIdOnSession: vi.fn(),
  syncTeamverWorkspaceFromSession: vi.fn(),
  setActiveTeamverWorkspace: vi.fn(),
  persistEmbedAuthSnapshot: vi.fn(),
  bootState: { complete: false },
}));

vi.mock("../../src/teamver/designBffClient", () => ({
  ensureDesignAuthLadder: h.ensureDesignAuthLadder,
  fetchDesignAuthSession: h.fetchDesignAuthSession,
  fetchTeamverRuntimeConfig: h.fetchTeamverRuntimeConfig,
  isDesignAuthRefreshDeclined: () => false,
  isTeamverRuntimeConfigAuthBlocked: () => false,
}));

vi.mock("../../src/teamver/teamverEmbedAuthNavigation", () => ({
  consumeLaunchWorkspaceIdHint: h.consumeLaunchWorkspaceIdHint,
  shouldDeferEmbedLoginRedirect: () => false,
}));

vi.mock("../../src/teamver/teamverEmbedAuthFlow", () => ({
  redirectToDesignLoginIfBffMissing: vi.fn(),
  resolveEmbedBootSessionOptions: vi.fn(() => ({})),
}));

vi.mock("../../src/teamver/syncTeamverWorkspace", () => ({
  readStoredWorkspaceIdOnSession: h.readStoredWorkspaceIdOnSession,
  syncTeamverWorkspaceFromSession: h.syncTeamverWorkspaceFromSession,
}));

vi.mock("../../src/teamver/setActiveTeamverWorkspace", () => ({
  setActiveTeamverWorkspace: h.setActiveTeamverWorkspace,
}));

vi.mock("../../src/teamver/embedAuthSnapshot", () => ({
  clearEmbedAuthSnapshot: vi.fn(),
  persistEmbedAuthSnapshot: h.persistEmbedAuthSnapshot,
}));

vi.mock("../../src/teamver/teamverEmbedSession", () => ({
  clearTeamverEmbedSessionState: vi.fn(async () => undefined),
  setTeamverEmbedSessionAuthenticated: vi.fn(),
}));

vi.mock("../../src/teamver/teamverEmbedBoot", () => ({
  completeTeamverEmbedBoot: () => {
    h.bootState.complete = true;
  },
  isTeamverEmbedBootComplete: () => h.bootState.complete,
}));

vi.mock("../../src/teamver/projectRegistry", () => ({
  ensureTeamverProjectRegisteredById: vi.fn(async () => undefined),
  syncAllDaemonProjectsToRegistry: vi.fn(async () => undefined),
}));

vi.mock("../../src/state/projects", () => ({
  getProject: vi.fn(async () => null),
}));

vi.mock("../../src/teamver/warmEmbedProjectListCaches", () => ({
  warmEmbedProjectListCaches: vi.fn(),
}));

vi.mock("../../src/teamver/teamverAuthReturn", () => ({
  consumeTeamverAuthReturnPending: vi.fn(() => true),
  peekTeamverAuthReturnPending: vi.fn(() => false),
}));

vi.mock("../../src/teamver/mainSsoMismatchRecovery", () => ({
  wasMainSsoMismatchRecoverAttemptedRecently: vi.fn(() => false),
}));

import {
  peekEmbedBootstrapSession,
  resetEmbedBootstrapSessionForTests,
} from "../../src/teamver/embedBootstrapSession";
import { runTeamverEmbedSessionBoot } from "../../src/teamver/teamverEmbedSessionBoot";

const SESSION = {
  authenticated: true,
  user: { userId: "user-1" },
  defaultWorkspaceId: "WS-A",
  workspaces: [
    { id: "WS-A", name: "Alpha", role: "owner" },
    { id: "WS-B", name: "Beta", role: "member" },
  ],
};

function bootDeps() {
  return {
    isCancelled: () => false,
    readDetailRoute: () => null,
    onProjectPrefetched: vi.fn(),
  };
}

describe("runTeamverEmbedSessionBoot workspace precedence (0908-N01 P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.bootState.complete = false;
    resetEmbedBootstrapSessionForTests();
    h.fetchDesignAuthSession.mockResolvedValue(SESSION);
    h.ensureDesignAuthLadder.mockResolvedValue(true);
    h.fetchTeamverRuntimeConfig.mockResolvedValue({ ok: true });
    h.consumeLaunchWorkspaceIdHint.mockReturnValue(null);
    h.readStoredWorkspaceIdOnSession.mockResolvedValue(null);
    h.syncTeamverWorkspaceFromSession.mockResolvedValue(null);
    h.setActiveTeamverWorkspace.mockResolvedValue(true);
  });

  it("keeps the pick made inside Design when Main also sends a launch hint", async () => {
    h.consumeLaunchWorkspaceIdHint.mockReturnValue("WS-A");
    h.readStoredWorkspaceIdOnSession.mockResolvedValue("WS-B");
    h.syncTeamverWorkspaceFromSession.mockResolvedValue("WS-B");

    await runTeamverEmbedSessionBoot(bootDeps());

    // The hint must not win, but staying silent is not the way to achieve that:
    // the BFF cookie would keep whatever Main last pinned (WS-A) while Design
    // renders and sends WS-B. Push the winner instead (0908-N01 slice E).
    expect(h.setActiveTeamverWorkspace).toHaveBeenCalledWith("WS-B", "user-1", {
      skipEventWhenUnchanged: true,
    });
    expect(h.setActiveTeamverWorkspace).not.toHaveBeenCalledWith(
      "WS-A",
      expect.anything(),
      expect.anything(),
    );
    expect(h.syncTeamverWorkspaceFromSession).toHaveBeenCalledTimes(1);
    expect(h.syncTeamverWorkspaceFromSession).toHaveBeenCalledWith(SESSION, undefined, {
      preferredIdOverride: "WS-B",
    });
    expect(peekEmbedBootstrapSession()?.activeWorkspaceId).toBe("WS-B");
  });

  it("realigns the BFF on a plain refresh, not only through /auth/callback", async () => {
    // Reproduces the deployed-but-still-broken case: no launch hint at all
    // (F5 or direct entry), stored pick present. Slice A took the local-only
    // branch here, so the server was never told and the next reconcile pulled
    // the store back to the cookie's workspace.
    h.consumeLaunchWorkspaceIdHint.mockReturnValue(null);
    h.readStoredWorkspaceIdOnSession.mockResolvedValue("WS-B");
    h.syncTeamverWorkspaceFromSession.mockResolvedValue("WS-B");

    await runTeamverEmbedSessionBoot(bootDeps());

    expect(h.setActiveTeamverWorkspace).toHaveBeenCalledWith("WS-B", "user-1", {
      skipEventWhenUnchanged: true,
    });
  });

  it("falls back to server truth when the BFF refuses the stored workspace", async () => {
    h.consumeLaunchWorkspaceIdHint.mockReturnValue(null);
    h.readStoredWorkspaceIdOnSession.mockResolvedValue("WS-B");
    h.setActiveTeamverWorkspace.mockResolvedValue(false);
    h.syncTeamverWorkspaceFromSession.mockResolvedValue("WS-A");

    await runTeamverEmbedSessionBoot(bootDeps());

    // No override — pinning a workspace the server rejected is the drift we
    // are trying to remove, just in the opposite direction.
    expect(h.syncTeamverWorkspaceFromSession).toHaveBeenCalledWith(
      SESSION,
      undefined,
      undefined,
    );
    expect(peekEmbedBootstrapSession()?.activeWorkspaceId).toBe("WS-A");
  });

  it("seeds from the launch hint only when Design has no stored pick yet", async () => {
    h.consumeLaunchWorkspaceIdHint.mockReturnValue("WS-A");
    h.readStoredWorkspaceIdOnSession.mockResolvedValue(null);
    h.syncTeamverWorkspaceFromSession.mockResolvedValue("WS-A");

    await runTeamverEmbedSessionBoot(bootDeps());

    expect(h.setActiveTeamverWorkspace).toHaveBeenCalledWith("WS-A", "user-1", {
      skipEventWhenUnchanged: true,
    });
    expect(h.syncTeamverWorkspaceFromSession).toHaveBeenCalledWith(
      SESSION,
      undefined,
      { preferredIdOverride: "WS-A" },
    );
    expect(peekEmbedBootstrapSession()?.activeWorkspaceId).toBe("WS-A");
  });

  it("does not force the hint when the BFF refuses the workspace switch", async () => {
    h.consumeLaunchWorkspaceIdHint.mockReturnValue("WS-A");
    h.readStoredWorkspaceIdOnSession.mockResolvedValue(null);
    h.setActiveTeamverWorkspace.mockResolvedValue(false);
    h.syncTeamverWorkspaceFromSession.mockResolvedValue("WS-B");

    await runTeamverEmbedSessionBoot(bootDeps());

    // Override would pin a workspace the server never accepted.
    expect(h.syncTeamverWorkspaceFromSession).toHaveBeenCalledWith(
      SESSION,
      undefined,
      undefined,
    );
  });

  it("reconciles plainly on a first-ever entry with neither hint nor stored pick", async () => {
    h.consumeLaunchWorkspaceIdHint.mockReturnValue(null);
    h.readStoredWorkspaceIdOnSession.mockResolvedValue(null);
    h.syncTeamverWorkspaceFromSession.mockResolvedValue("WS-A");

    await runTeamverEmbedSessionBoot(bootDeps());

    // Nothing to assert to the server — the account default already is the
    // cookie's workspace, so a POST would be a wasted round trip on every boot.
    expect(h.setActiveTeamverWorkspace).not.toHaveBeenCalled();
    expect(h.syncTeamverWorkspaceFromSession).toHaveBeenCalledWith(SESSION);
  });

  it("consumes the launch hint exactly once per boot", async () => {
    h.consumeLaunchWorkspaceIdHint.mockReturnValue("WS-A");
    h.syncTeamverWorkspaceFromSession.mockResolvedValue("WS-A");

    await runTeamverEmbedSessionBoot(bootDeps());

    // A second read would re-apply Main's workspace after the user switches.
    expect(h.consumeLaunchWorkspaceIdHint).toHaveBeenCalledTimes(1);
  });

  it("persists the resolved workspace in the auth snapshot, not the hint", async () => {
    h.consumeLaunchWorkspaceIdHint.mockReturnValue("WS-A");
    h.readStoredWorkspaceIdOnSession.mockResolvedValue("WS-B");
    h.syncTeamverWorkspaceFromSession.mockResolvedValue("WS-B");

    await runTeamverEmbedSessionBoot(bootDeps());

    expect(h.persistEmbedAuthSnapshot).toHaveBeenCalledWith({
      session: SESSION,
      activeWorkspaceId: "WS-B",
    });
  });
});
