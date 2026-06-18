// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTeamverEmbed } from "../src/teamver/useTeamverEmbed";
import { TEAMVER_WORKSPACE_CHANGED_EVENT } from "../src/teamver/teamverWorkspaceEvents";
import * as designApiBase from "../src/teamver/designApiBase";
import * as designBffClient from "../src/teamver/designBffClient";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverLoginUrl: vi.fn(() => "https://teamver.com/auth/signin"),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  fetchDesignAuthSession: vi.fn(),
  getDesignBffClient: vi.fn(),
}));

describe("useTeamverEmbed", () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockReset();
    vi.mocked(designBffClient.getDesignBffClient).mockReset();
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

    const workspaceEvents: string[] = [];
    window.addEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, (event) => {
      workspaceEvents.push(
        (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId ?? "",
      );
    });

    const { result } = renderHook(() => useTeamverEmbed(true));

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true);
      expect(result.current.activeWorkspaceId).toBe("WS-1");
    });
    expect(store.set).toHaveBeenCalledWith("WS-1");
    expect(store.setLastForUser).toHaveBeenCalledWith("user-1", "WS-1");

    await act(async () => {
      await result.current.switchWorkspace("WS-2");
    });

    expect(result.current.activeWorkspaceId).toBe("WS-2");
    expect(result.current.activeWorkspaceLabel).toBe("Beta Team");
    expect(store.set).toHaveBeenLastCalledWith("WS-2");
    expect(store.setLastForUser).toHaveBeenLastCalledWith("user-1", "WS-2");
    expect(workspaceEvents).toContain("WS-2");
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
});
