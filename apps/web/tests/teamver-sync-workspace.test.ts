// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT,
  TEAMVER_WORKSPACE_CHANGED_EVENT,
  type TeamverWorkspaceAutoSwitchedDetail,
} from "../src/teamver/teamverWorkspaceEvents";

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

import {
  readStoredWorkspaceIdOnSession,
  syncTeamverWorkspaceFromSession,
} from "../src/teamver/syncTeamverWorkspace";

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

/**
 * 루프477 (0908-N01 P1) — boot and `/auth/callback` use this to decide whether
 * Main FE's launch `workspace_id` may seed the store. An existing in-Design
 * pick must win, otherwise every re-entry from Main overwrites it.
 */
describe("readStoredWorkspaceIdOnSession", () => {
  beforeEach(() => {
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue(null);
  });

  const session = {
    authenticated: true,
    user: { userId: "user-1" },
    defaultWorkspaceId: "WS-default",
    workspaces: [
      { id: "WS-picked", name: "Picked", role: "owner", appEnabled: false },
      { id: "WS-default", name: "Default", role: "owner", appEnabled: true },
    ],
  };

  it("returns the stored pick even when the Design app is disabled on it", async () => {
    storeGetMock.mockResolvedValue("WS-picked");
    // `appEnabled` is the auto-switch path's concern (P2), not this guard's.
    expect(await readStoredWorkspaceIdOnSession(session)).toBe("WS-picked");
  });

  it("returns null when the stored pick is no longer on the session list", async () => {
    storeGetMock.mockResolvedValue("WS-revoked");
    expect(await readStoredWorkspaceIdOnSession(session)).toBeNull();
  });

  it("returns null on a first-ever entry so the launch hint may seed the store", async () => {
    storeGetMock.mockResolvedValue(null);
    expect(await readStoredWorkspaceIdOnSession(session)).toBeNull();
  });

  it("returns null for an unauthenticated session", async () => {
    storeGetMock.mockResolvedValue("WS-picked");
    expect(
      await readStoredWorkspaceIdOnSession({ ...session, authenticated: false }),
    ).toBeNull();
  });
});

/** 루프477 (0908-N01 P2) — an unrequested move must never be silent. */
describe("workspace auto-switch notice", () => {
  const notices: TeamverWorkspaceAutoSwitchedDetail[] = [];
  const collect = (event: Event) => {
    notices.push((event as CustomEvent<TeamverWorkspaceAutoSwitchedDetail>).detail);
  };

  beforeEach(() => {
    notices.length = 0;
    storeSetMock.mockClear();
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue(null);
    storeGetPreferredMock.mockReset();
    storeGetPreferredMock.mockReturnValue(null);
    window.addEventListener(TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT, collect);
  });

  afterEach(() => {
    window.removeEventListener(TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT, collect);
  });

  it("reports app-disabled when the pick is still listed but Design is off", async () => {
    storeGetMock.mockResolvedValue("WS-disabled");

    const active = await syncTeamverWorkspaceFromSession({
      authenticated: true,
      user: { userId: "user-1" },
      defaultWorkspaceId: "WS-other",
      workspaces: [
        { id: "WS-disabled", name: "Disabled", role: "owner", appEnabled: false },
        { id: "WS-other", name: "Other", role: "owner", appEnabled: true },
      ],
    });

    expect(active).toBe("WS-other");
    expect(notices).toEqual([
      { from: "WS-disabled", to: "WS-other", reason: "app-disabled" },
    ]);
  });

  it("reports revoked when the pick vanished from the session list", async () => {
    storeGetMock.mockResolvedValue("WS-revoked");

    const active = await syncTeamverWorkspaceFromSession({
      authenticated: true,
      user: { userId: "user-1" },
      defaultWorkspaceId: "WS-other",
      workspaces: [{ id: "WS-other", name: "Other", role: "owner" }],
    });

    expect(active).toBe("WS-other");
    expect(notices).toEqual([
      { from: "WS-revoked", to: "WS-other", reason: "revoked" },
    ]);
  });

  it("stays quiet for a requested switch and for a first-ever seed", async () => {
    const workspaces = [
      { id: "WS-a", name: "A", role: "owner" },
      { id: "WS-b", name: "B", role: "owner" },
    ];

    storeGetMock.mockResolvedValue("WS-a");
    await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-a",
        workspaces,
      },
      workspaces,
      { preferredIdOverride: "WS-b" },
    );

    storeGetMock.mockResolvedValue(null);
    await syncTeamverWorkspaceFromSession(
      {
        authenticated: true,
        user: { userId: "user-1" },
        defaultWorkspaceId: "WS-a",
        workspaces,
      },
      workspaces,
    );

    expect(notices).toEqual([]);
  });
});
