// @vitest-environment jsdom
/**
 * 0908-N01 slice G — a single back-navigation calls
 * `resolveActiveTeamverWorkspaceId` 4-10 times at once (inflight key, registry
 * list, tombstone filter, daemon enrich headers, `HomeView` mount). Each call
 * used to probe the session and reconcile on its own, so one response that came
 * back without the stored workspace moved the user's pick — and the write also
 * promoted the fallback to the per-user record, so there was nothing to return
 * to once the workspace reappeared.
 *
 * These cases assert the burst joins, the read writes nothing, and a flaky
 * response does not survive its own request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionWorkspace = {
  id: string;
  name: string;
  role: "owner";
  appEnabled?: boolean;
};

const WS_PICKED: SessionWorkspace = { id: "WS-picked", name: "Picked", role: "owner" };
const WS_DEFAULT: SessionWorkspace = { id: "WS-default", name: "Default", role: "owner" };

let sessionWorkspaces: SessionWorkspace[] = [WS_PICKED, WS_DEFAULT];
let sessionDelayMs = 0;

const storeGetMock = vi.fn(async (): Promise<string | null> => "WS-picked");
const storeSetMock = vi.fn(async () => undefined);
const storeSetLastForUserMock = vi.fn();
const storeGetLastForUserMock = vi.fn((): string | null => null);

const fetchDesignAuthSessionMock = vi.fn(async () => {
  if (sessionDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, sessionDelayMs));
  }
  return {
    authenticated: true,
    user: { userId: "user-1" },
    defaultWorkspaceId: "WS-default",
    workspaces: sessionWorkspaces,
  };
});

vi.mock("../../src/teamver/designBffClient", () => ({
  // Wrapped, not passed by reference: the factory is hoisted above the const
  // declarations, so naming the mock directly here is a TDZ error at import.
  fetchDesignAuthSession: vi.fn(() => fetchDesignAuthSessionMock()),
  getDesignBffClient: vi.fn(() => ({
    workspaceStore: {
      get: storeGetMock,
      set: storeSetMock,
      setLastForUser: storeSetLastForUserMock,
      getLastForUser: storeGetLastForUserMock,
    },
  })),
  isDesignAuthRefreshDeclined: vi.fn(() => false),
  shouldSkipTeamverBffAuthCalls: vi.fn(() => false),
}));

vi.mock("../../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

import {
  resetActiveTeamverWorkspaceFlightForTests,
  resolveActiveTeamverWorkspaceId,
} from "../../src/teamver/activeTeamverWorkspace";
import { bumpTeamverWorkspaceStoreRevision } from "../../src/teamver/teamverWorkspaceStoreRevision";

const REVISION_KEY = "teamver_design_workspace_store_revision_ms";

describe("resolveActiveTeamverWorkspaceId concurrency", () => {
  beforeEach(() => {
    sessionWorkspaces = [WS_PICKED, WS_DEFAULT];
    sessionDelayMs = 0;
    storeGetMock.mockClear();
    storeGetMock.mockResolvedValue("WS-picked");
    storeSetMock.mockClear();
    storeSetLastForUserMock.mockClear();
    storeGetLastForUserMock.mockClear();
    storeGetLastForUserMock.mockReturnValue(null);
    fetchDesignAuthSessionMock.mockClear();
    localStorage.removeItem(REVISION_KEY);
    resetActiveTeamverWorkspaceFlightForTests();
  });

  it("joins a burst of concurrent calls into one judgement", async () => {
    sessionDelayMs = 5;

    const results = await Promise.all(
      Array.from({ length: 8 }, () => resolveActiveTeamverWorkspaceId()),
    );

    expect(results).toEqual(Array.from({ length: 8 }, () => "WS-picked"));
    expect(fetchDesignAuthSessionMock).toHaveBeenCalledTimes(1);
    expect(storeGetMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the durable pick when one response in a burst omits it", async () => {
    // Eight readers, and the session that answers the joined flight is the
    // flaky one: the list came back but the user's workspace is not on it.
    sessionWorkspaces = [WS_DEFAULT];
    storeGetLastForUserMock.mockReturnValue("WS-picked");
    sessionDelayMs = 5;

    const results = await Promise.all(
      Array.from({ length: 8 }, () => resolveActiveTeamverWorkspaceId()),
    );

    // The request still gets a workspace the session accepts — pinning
    // X-Workspace-Id to a rejected workspace would 403 every call.
    expect(results).toEqual(Array.from({ length: 8 }, () => "WS-default"));
    // But nothing is persisted, so the pick survives the flake.
    expect(storeSetMock).not.toHaveBeenCalled();
    expect(storeSetLastForUserMock).not.toHaveBeenCalled();

    // Next burst, session healed — back on the user's workspace with no
    // recovery step, because the read never destroyed it.
    sessionWorkspaces = [WS_PICKED, WS_DEFAULT];
    resetActiveTeamverWorkspaceFlightForTests();
    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe("WS-picked");
  });

  it("treats an empty workspace list as no evidence, not as revocation", async () => {
    sessionWorkspaces = [];

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe("WS-picked");
    expect(storeSetMock).not.toHaveBeenCalled();
    expect(storeSetLastForUserMock).not.toHaveBeenCalled();
  });

  it("prefers the durable pick over the account default as a fallback", async () => {
    storeGetMock.mockResolvedValue("WS-gone");
    storeGetLastForUserMock.mockReturnValue("WS-picked");

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe("WS-picked");
    expect(storeSetMock).not.toHaveBeenCalled();
  });

  it("does not join a flight started before an explicit workspace switch", async () => {
    sessionDelayMs = 5;
    const before = resolveActiveTeamverWorkspaceId();

    // `setActiveTeamverWorkspace` bumps the revision; a reader that runs after
    // it must not be answered with the pre-switch workspace.
    bumpTeamverWorkspaceStoreRevision();
    storeGetMock.mockResolvedValue("WS-default");
    const after = resolveActiveTeamverWorkspaceId();

    expect(await before).toBe("WS-picked");
    expect(await after).toBe("WS-default");
    expect(fetchDesignAuthSessionMock).toHaveBeenCalledTimes(2);
  });
});
