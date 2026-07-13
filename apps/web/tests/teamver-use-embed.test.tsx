// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTeamverEmbed } from "../src/teamver/useTeamverEmbed";
import * as designApiBase from "../src/teamver/designApiBase";
import * as designAuthFlow from "../src/teamver/designAuthFlow";
import * as designBffClient from "../src/teamver/designBffClient";
import * as teamverEmbedSession from "../src/teamver/teamverEmbedSession";
import * as teamverAuthCookieHints from "../src/teamver/teamverAuthCookieHints";
import * as teamverAuthReturn from "../src/teamver/teamverAuthReturn";
import * as teamverWorkspaceEvents from "../src/teamver/teamverWorkspaceEvents";
import { NetworkError } from "@teamver/app-sdk";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  isBootstrapAuthMode: vi.fn(() => true),
  buildDesignColdStartLoginUrl: vi.fn(() => "https://teamver.com/auth/signin?app_id=teamver-design"),
  resolveTeamverLoginUrl: vi.fn(() => "https://teamver.com/auth/signin"),
  redirectToTeamverLogin: vi.fn(),
  markTeamverLoginRedirectAttempt: vi.fn(() => true),
  prepareTeamverLoginNavigation: vi.fn(),
}));

vi.mock("../src/teamver/designAuthFlow", () => ({
  redirectToDesignLogin: vi.fn(async () => undefined),
  redirectToTeamverLoginPreservingRoute: vi.fn(),
}));

vi.mock("../src/teamver/teamverEmbedAuthNavigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/teamverEmbedAuthNavigation")>();
  return {
    ...actual,
    shouldDeferEmbedLoginRedirect: vi.fn(() => false),
  };
});

vi.mock("../src/teamver/teamverEmbedBoot", () => ({
  waitForTeamverEmbedBoot: vi.fn(async () => undefined),
  isTeamverEmbedBootComplete: vi.fn(() => true),
}));

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  clearTeamverEmbedSessionState: vi.fn(async () => undefined),
  setTeamverEmbedSessionAuthenticated: vi.fn(),
  isTeamverEmbedSessionAuthenticated: vi.fn(() => false),
  subscribeTeamverEmbedSessionChanged: vi.fn(() => () => {}),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  fetchDesignAuthSession: vi.fn(),
  getDesignBffClient: vi.fn(),
  prepareDesignAuthSessionReload: vi.fn(),
  refreshDesignAuthCookie: vi.fn(async () => true),
  invalidateDesignAuthSessionCache: vi.fn(),
  resetDesignAuthRefreshState: vi.fn(),
  resetDesignAuthBareRefreshAttempt: vi.fn(),
  isDesignAuthRefreshDeclined: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverAuthCookieHints", () => ({
  hasProbableTeamverAuthCookie: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverAuthReturn", () => ({
  peekTeamverAuthReturnPending: vi.fn(() => false),
  consumeTeamverAuthReturnPending: vi.fn(() => false),
  isLikelyTeamverAuthReturnNavigation: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverWorkspaceEvents", () => ({
  dispatchTeamverWorkspaceChanged: vi.fn(),
  TEAMVER_WORKSPACE_CHANGED_EVENT: "teamver-workspace-changed",
}));

describe("useTeamverEmbed", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designApiBase.isBootstrapAuthMode).mockReturnValue(true);
    vi.mocked(teamverEmbedSession.isTeamverEmbedSessionAuthenticated).mockReturnValue(false);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockReset();
    vi.mocked(designBffClient.getDesignBffClient).mockReset();
    vi.mocked(designBffClient.invalidateDesignAuthSessionCache).mockClear();
    vi.mocked(designBffClient.resetDesignAuthRefreshState).mockClear();
    vi.mocked(designBffClient.resetDesignAuthBareRefreshAttempt).mockClear();
    vi.mocked(designBffClient.isDesignAuthRefreshDeclined).mockReturnValue(false);
    vi.mocked(designBffClient.prepareDesignAuthSessionReload).mockClear();
    vi.mocked(teamverAuthCookieHints.hasProbableTeamverAuthCookie).mockReturnValue(false);
    vi.mocked(teamverAuthReturn.peekTeamverAuthReturnPending).mockReturnValue(false);
    vi.mocked(teamverAuthReturn.consumeTeamverAuthReturnPending).mockReturnValue(false);
    vi.mocked(teamverAuthReturn.isLikelyTeamverAuthReturnNavigation).mockReturnValue(false);
    vi.mocked(teamverWorkspaceEvents.dispatchTeamverWorkspaceChanged).mockClear();
    vi.mocked(designAuthFlow.redirectToTeamverLoginPreservingRoute).mockClear();
    vi.mocked(designAuthFlow.redirectToDesignLogin).mockClear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("seeds the active workspace and dispatches an event when switching", async () => {
    const store = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      setLastForUser: vi.fn(),
    };
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: store,
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1", email: "u1@example.com" },
      defaultWorkspaceId: "WS-1",
      workspaces: [
        { id: "WS-1", name: "Alpha", role: "owner", isAccountDefaultWorkspace: true },
        { id: "WS-2", name: "Beta Team", role: "member" },
      ],
    });

    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true);
      expect(result.current.activeWorkspaceId).toBe("WS-1");
    });
    expect(store.set).toHaveBeenCalledWith("WS-1");
    expect(store.setLastForUser).toHaveBeenCalledWith("user-1", "WS-1");
    expect(teamverWorkspaceEvents.dispatchTeamverWorkspaceChanged).toHaveBeenCalledWith("WS-1");

    vi.mocked(teamverWorkspaceEvents.dispatchTeamverWorkspaceChanged).mockClear();

    await act(async () => {
      await result.current.switchWorkspace("WS-2");
    });

    expect(result.current.activeWorkspaceId).toBe("WS-2");
    expect(result.current.activeWorkspaceLabel).toBe("Beta Team");
    expect(store.set).toHaveBeenLastCalledWith("WS-2");
    expect(store.setLastForUser).toHaveBeenLastCalledWith("user-1", "WS-2");
    expect(teamverWorkspaceEvents.dispatchTeamverWorkspaceChanged).toHaveBeenCalledWith("WS-2");
  });

  it("does not re-dispatch workspace-changed on focus refresh when store already had the id", async () => {
    const store = {
      get: vi.fn(async () => "WS-1"),
      set: vi.fn(async () => undefined),
      setLastForUser: vi.fn(),
    };
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: store,
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1", email: "u1@example.com" },
      defaultWorkspaceId: "WS-1",
      workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
    });

    renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalled();
    });
    expect(teamverWorkspaceEvents.dispatchTeamverWorkspaceChanged).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("surfaces designAppEnabled=false when active workspace is disabled", async () => {
    const store = {
      get: vi.fn(async () => "WS-1"),
      set: vi.fn(async () => undefined),
      setLastForUser: vi.fn(),
    };
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: store,
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1", email: "u1@example.com" },
      defaultWorkspaceId: "WS-1",
      workspaces: [
        {
          id: "WS-1",
          name: "Blocked",
          role: "owner",
          appEnabled: false,
          appDisabledReason: "app_disabled_globally",
        },
      ],
    });

    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.designAppEnabled).toBe(false);
      expect(result.current.designDisabledReason).toBe("app_disabled_globally");
    });
  });

  it("resets to the default state outside Teamver embed mode", async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.authenticated).toBe(false);
    });
    expect(designBffClient.fetchDesignAuthSession).not.toHaveBeenCalled();
  });

  it("keeps authenticated UI when a forced re-probe is unreachable", async () => {
    vi.mocked(teamverEmbedSession.isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    vi.mocked(designBffClient.fetchDesignAuthSession)
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1", email: "u1@example.com" },
        defaultWorkspaceId: "WS-1",
        workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
      })
      .mockResolvedValueOnce(null);

    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true);
    });

    await act(async () => {
      await result.current.refresh({ force: true });
    });

    expect(result.current.authenticated).toBe(true);
    expect(result.current.error).toBe("session_unreachable");
    expect(teamverEmbedSession.clearTeamverEmbedSessionState).not.toHaveBeenCalled();
  });

  it("keeps authenticated UI when a focus refresh briefly reads unauthenticated", async () => {
    vi.mocked(teamverEmbedSession.isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    vi.mocked(designBffClient.fetchDesignAuthSession)
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1", email: "u1@example.com" },
        defaultWorkspaceId: "WS-1",
        workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
      })
      .mockResolvedValueOnce({
        authenticated: false,
        workspaces: [],
      });

    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true);
    });

    await act(async () => {
      await result.current.refresh({ force: true });
    });

    expect(result.current.authenticated).toBe(true);
    expect(result.current.error).toBe("session_unreachable");
    expect(teamverEmbedSession.clearTeamverEmbedSessionState).not.toHaveBeenCalled();
    expect(teamverEmbedSession.setTeamverEmbedSessionAuthenticated).not.toHaveBeenCalledWith(false);
  });

  it("keeps session_unreachable after silent routine focus refresh failures", async () => {
    vi.mocked(teamverEmbedSession.isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    vi.mocked(designBffClient.fetchDesignAuthSession)
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1", email: "u1@example.com" },
        defaultWorkspaceId: "WS-1",
        workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
      })
      .mockResolvedValueOnce(null);

    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true);
    });

    await act(async () => {
      await result.current.refresh({ force: false, silent: true });
    });

    expect(result.current.authenticated).toBe(true);
    expect(result.current.error).toBe("session_unreachable");
  });

  it("runs passive auth recovery on silent 401 without immediate login redirect", async () => {
    vi.mocked(teamverEmbedSession.isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    vi.mocked(designBffClient.fetchDesignAuthSession)
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1", email: "u1@example.com" },
        defaultWorkspaceId: "WS-1",
        workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
      })
      .mockRejectedValueOnce(new NetworkError({ status: 401, message: "Unauthorized" }));

    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true);
    });

    await act(async () => {
      await result.current.refresh({ force: true, silent: true });
    });

    expect(result.current.authenticated).toBe(true);
    expect(result.current.error).toBe("session_unreachable");
    expect(designBffClient.prepareDesignAuthSessionReload).not.toHaveBeenCalled();
    expect(designAuthFlow.redirectToTeamverLoginPreservingRoute).not.toHaveBeenCalled();
  });

  it("auto-retries session_unreachable with a 5s backoff while the tab is visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      vi.mocked(teamverEmbedSession.isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
      vi.mocked(designBffClient.fetchDesignAuthSession)
        .mockResolvedValueOnce({
          authenticated: true,
          user: { userId: "user-1", email: "u1@example.com" },
          defaultWorkspaceId: "WS-1",
          workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          authenticated: true,
          user: { userId: "user-1", email: "u1@example.com" },
          defaultWorkspaceId: "WS-1",
          workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
        });

      const { result } = renderHook(() => useTeamverEmbed(true));

      await vi.waitFor(() => {
        expect(result.current.authenticated).toBe(true);
      });

      await act(async () => {
        await result.current.refresh({ force: true });
      });
      expect(result.current.error).toBe("session_unreachable");
      const callsAfterFail = vi.mocked(designBffClient.fetchDesignAuthSession).mock.calls.length;

      // Advance well past the 5s first-attempt backoff window.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });

      await vi.waitFor(() => {
        expect(vi.mocked(designBffClient.fetchDesignAuthSession).mock.calls.length).toBeGreaterThan(
          callsAfterFail,
        );
      });
      expect(result.current.error).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps session_unreachable visibility return on backoff instead of immediate auth probing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      vi.mocked(teamverEmbedSession.isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
      vi.mocked(designBffClient.fetchDesignAuthSession)
        .mockResolvedValueOnce({
          authenticated: true,
          user: { userId: "user-1", email: "u1@example.com" },
          defaultWorkspaceId: "WS-1",
          workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          authenticated: true,
          user: { userId: "user-1", email: "u1@example.com" },
          defaultWorkspaceId: "WS-1",
          workspaces: [{ id: "WS-1", name: "Alpha", role: "owner" }],
        });

      const { result } = renderHook(() => useTeamverEmbed(true));

      await vi.waitFor(() => {
        expect(result.current.authenticated).toBe(true);
      });

      await act(async () => {
        await result.current.refresh({ force: true });
      });
      expect(result.current.error).toBe("session_unreachable");
      const callsAfterFail = vi.mocked(designBffClient.fetchDesignAuthSession).mock.calls.length;

      document.dispatchEvent(new Event("visibilitychange"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(vi.mocked(designBffClient.fetchDesignAuthSession)).toHaveBeenCalledTimes(callsAfterFail);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });
      await vi.waitFor(() => {
        expect(vi.mocked(designBffClient.fetchDesignAuthSession).mock.calls.length).toBeGreaterThan(
          callsAfterFail,
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps routine 401 on passive recovery without marking auth-return reload", async () => {
    vi.mocked(designBffClient.fetchDesignAuthSession).mockRejectedValue(
      new NetworkError({ status: 401, message: "Unauthorized" }),
    );

    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.error).toBe("not_authenticated");
    });
    expect(designBffClient.prepareDesignAuthSessionReload).not.toHaveBeenCalled();
    expect(designAuthFlow.redirectToTeamverLoginPreservingRoute).not.toHaveBeenCalled();
    expect(teamverEmbedSession.clearTeamverEmbedSessionState).not.toHaveBeenCalled();
    expect(designApiBase.redirectToTeamverLogin).not.toHaveBeenCalled();
  });

  it("redirects with returnTo on explicit auth-recovery 401", async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        pathname: "/p/PROJ-42",
        search: "?theme=dark",
        href: "https://stg-design.teamver.com/p/PROJ-42?theme=dark",
      },
    });
    vi.mocked(designBffClient.fetchDesignAuthSession).mockRejectedValue(
      new NetworkError({ status: 401, message: "Unauthorized" }),
    );

    const { result } = renderHook(() => useTeamverEmbed(true));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.refresh({ resetRefreshState: true });
    });

    expect(designAuthFlow.redirectToTeamverLoginPreservingRoute).toHaveBeenCalledWith(
      expect.objectContaining({ returnTo: "/p/PROJ-42" }),
    );
    expect(teamverEmbedSession.clearTeamverEmbedSessionState).toHaveBeenCalled();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("redirects to Design login on cold boot when BFF session is missing despite Main cookie hint", async () => {
    vi.mocked(teamverAuthCookieHints.hasProbableTeamverAuthCookie).mockReturnValue(true);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: false,
      workspaces: [],
    });

    renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(designAuthFlow.redirectToDesignLogin).toHaveBeenCalledTimes(1);
    });
  });

  it("visibility/focus refresh probes session without busting cache or sticky refresh-decline", async () => {
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: false,
      workspaces: [],
    });

    renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledTimes(1);
    });

    vi.mocked(designBffClient.fetchDesignAuthSession).mockClear();
    vi.mocked(designBffClient.invalidateDesignAuthSessionCache).mockClear();
    vi.mocked(designBffClient.resetDesignAuthRefreshState).mockClear();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(designBffClient.invalidateDesignAuthSessionCache).not.toHaveBeenCalled();
    expect(designBffClient.resetDesignAuthRefreshState).not.toHaveBeenCalled();
    expect(designBffClient.resetDesignAuthBareRefreshAttempt).not.toHaveBeenCalled();
    expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledWith({
      force: false,
      resetRefreshState: false,
    });
    expect(designBffClient.fetchDesignAuthSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ resetRefreshState: true }),
    );
  });

  it("resets sticky refresh-decline when an auth cookie hint newly appears on focus", async () => {
    vi.mocked(teamverAuthCookieHints.hasProbableTeamverAuthCookie).mockReturnValue(false);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: false,
      workspaces: [],
    });

    renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledTimes(1);
    });

    vi.mocked(designBffClient.fetchDesignAuthSession).mockClear();
    vi.mocked(designBffClient.resetDesignAuthRefreshState).mockClear();
    vi.mocked(teamverAuthCookieHints.hasProbableTeamverAuthCookie).mockReturnValue(true);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(designBffClient.resetDesignAuthRefreshState).toHaveBeenCalledTimes(1);
    expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledWith({
      force: true,
      resetRefreshState: false,
    });
  });

  it("resets bare refresh attempt on focus when unauthenticated with a visible cookie hint", async () => {
    vi.mocked(teamverAuthCookieHints.hasProbableTeamverAuthCookie).mockReturnValue(true);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: false,
      workspaces: [],
    });

    renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledTimes(1);
    });

    vi.mocked(designBffClient.resetDesignAuthBareRefreshAttempt).mockClear();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(designBffClient.resetDesignAuthBareRefreshAttempt).toHaveBeenCalledTimes(1);
    expect(designBffClient.resetDesignAuthRefreshState).not.toHaveBeenCalled();
  });

  it("forces a quiet session probe on bfcache pageshow restore without resetting sticky decline", async () => {
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: false,
      workspaces: [],
    });

    renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledTimes(1);
    });

    vi.mocked(designBffClient.resetDesignAuthRefreshState).mockClear();

    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(designBffClient.resetDesignAuthRefreshState).not.toHaveBeenCalled();
    expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledWith({
      force: true,
      resetRefreshState: false,
    });
  });

  it("resets refresh state and retries with resetRefreshState after Main FE sign-in return", async () => {
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: false,
      workspaces: [],
    });

    renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledTimes(1);
    });

    vi.mocked(designBffClient.fetchDesignAuthSession).mockClear();
    vi.mocked(designBffClient.resetDesignAuthRefreshState).mockClear();
    vi.mocked(teamverAuthReturn.isLikelyTeamverAuthReturnNavigation).mockReturnValue(true);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(designBffClient.resetDesignAuthRefreshState).toHaveBeenCalledTimes(1);
    expect(designBffClient.fetchDesignAuthSession).toHaveBeenCalledWith({
      force: true,
      resetRefreshState: true,
    });
  });
});
