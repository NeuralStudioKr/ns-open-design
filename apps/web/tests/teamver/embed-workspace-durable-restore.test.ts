// @vitest-environment jsdom
/**
 * 0908-N01 slice G — G3 stops a reconcile from promoting its fallback to the
 * per-user durable record, and this is the reader that makes that worth doing:
 * boot returns to the workspace the user actually picked once the session lists
 * it again. Without it, `getPreferredWorkspaceIdForBootstrap` still answers
 * with the reconciled active key and the flake is permanent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const storeGetMock = vi.fn(async (): Promise<string | null> => null);
const storeGetLastForUserMock = vi.fn((): string | null => null);

vi.mock("../../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    workspaceStore: {
      get: storeGetMock,
      set: vi.fn(async () => undefined),
      setLastForUser: vi.fn(),
      getLastForUser: storeGetLastForUserMock,
    },
  })),
}));

import { readStoredWorkspaceIdOnSession } from "../../src/teamver/syncTeamverWorkspace";

const session = {
  authenticated: true,
  user: { userId: "user-1" },
  defaultWorkspaceId: "WS-default",
  workspaces: [
    { id: "WS-picked", name: "Picked", role: "owner" as const, appEnabled: true },
    { id: "WS-default", name: "Default", role: "owner" as const, appEnabled: true },
    { id: "WS-off", name: "Off", role: "owner" as const, appEnabled: false },
  ],
};

describe("readStoredWorkspaceIdOnSession durable restore", () => {
  beforeEach(() => {
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue(null);
    storeGetLastForUserMock.mockReset();
    storeGetLastForUserMock.mockReturnValue(null);
  });

  it("returns to the durable pick when a reconcile moved only the active key", async () => {
    // An explicit switch writes both keys, so a disagreement can only mean a
    // reconcile moved the active key on its own.
    storeGetMock.mockResolvedValue("WS-default");
    storeGetLastForUserMock.mockReturnValue("WS-picked");

    expect(await readStoredWorkspaceIdOnSession(session)).toBe("WS-picked");
  });

  it("does not restore a durable pick whose Design app is disabled", async () => {
    // P2 moved off this workspace on purpose. Restoring it would make every
    // refresh bounce between the two.
    storeGetMock.mockResolvedValue("WS-default");
    storeGetLastForUserMock.mockReturnValue("WS-off");

    expect(await readStoredWorkspaceIdOnSession(session)).toBe("WS-default");
  });

  it("does not restore a durable pick that is no longer on the session", async () => {
    storeGetMock.mockResolvedValue("WS-default");
    storeGetLastForUserMock.mockReturnValue("WS-revoked");

    expect(await readStoredWorkspaceIdOnSession(session)).toBe("WS-default");
  });

  it("leaves the active key alone when both keys agree", async () => {
    storeGetMock.mockResolvedValue("WS-picked");
    storeGetLastForUserMock.mockReturnValue("WS-picked");

    expect(await readStoredWorkspaceIdOnSession(session)).toBe("WS-picked");
  });

  it("still reports null on a first-ever entry so the launch hint may seed", async () => {
    expect(await readStoredWorkspaceIdOnSession(session)).toBeNull();
  });

  it("uses the durable pick when the active key was cleared by sign-out", async () => {
    storeGetLastForUserMock.mockReturnValue("WS-picked");
    expect(await readStoredWorkspaceIdOnSession(session)).toBe("WS-picked");
  });
});
