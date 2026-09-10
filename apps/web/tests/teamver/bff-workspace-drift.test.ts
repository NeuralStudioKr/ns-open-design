// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const storeGetMock = vi.fn(async (): Promise<string | null> => null);
const storeSetMock = vi.fn(async () => undefined);
const storeSetLastForUserMock = vi.fn();
const setActiveMock = vi.fn(async () => true);
const bumpRevisionMock = vi.fn();

vi.mock("../../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    workspaceStore: {
      get: storeGetMock,
      set: storeSetMock,
      setLastForUser: storeSetLastForUserMock,
    },
  })),
}));

vi.mock("../../src/teamver/setActiveTeamverWorkspace", () => ({
  setActiveTeamverWorkspace: (...args: unknown[]) => setActiveMock(...args),
}));

vi.mock("../../src/teamver/teamverWorkspaceStoreRevision", () => ({
  bumpTeamverWorkspaceStoreRevision: () => bumpRevisionMock(),
}));

import {
  applyBffWorkspaceDriftRepair,
  planBffWorkspaceDriftRepair,
} from "../../src/teamver/bffWorkspaceDrift";

describe("planBffWorkspaceDriftRepair", () => {
  it("realigns BFF when local (P1) disagrees", () => {
    expect(
      planBffWorkspaceDriftRepair({
        bffActiveWorkspaceId: "WS-A",
        localWorkspaceId: "WS-B",
      }),
    ).toEqual({ action: "realignBff", localId: "WS-B" });
  });

  it("seeds local when BFF has a workspace and local is empty", () => {
    expect(
      planBffWorkspaceDriftRepair({
        bffActiveWorkspaceId: "WS-A",
        localWorkspaceId: null,
      }),
    ).toEqual({ action: "seedLocal", bffId: "WS-A" });
  });

  it("is a no-op when they already match", () => {
    expect(
      planBffWorkspaceDriftRepair({
        bffActiveWorkspaceId: "WS-A",
        localWorkspaceId: "WS-A",
      }),
    ).toEqual({ action: "noop" });
  });

  it("keeps local when BFF has no active workspace", () => {
    expect(
      planBffWorkspaceDriftRepair({
        bffActiveWorkspaceId: null,
        localWorkspaceId: "WS-B",
      }),
    ).toEqual({ action: "noop" });
  });
});

describe("applyBffWorkspaceDriftRepair", () => {
  beforeEach(() => {
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue(null);
    storeSetMock.mockClear();
    storeSetLastForUserMock.mockClear();
    setActiveMock.mockClear();
    bumpRevisionMock.mockClear();
  });

  it("calls setActive with the local id when BFF drifted (P1)", async () => {
    storeGetMock.mockResolvedValue("WS-B");
    const plan = await applyBffWorkspaceDriftRepair(
      { authenticated: true, activeWorkspaceId: "WS-A", user: { userId: "u1" } },
      "u1",
    );
    expect(plan).toEqual({ action: "realignBff", localId: "WS-B" });
    expect(setActiveMock).toHaveBeenCalledWith("WS-B", "u1", {
      skipEventWhenUnchanged: true,
    });
    expect(storeSetMock).not.toHaveBeenCalled();
  });

  it("seeds the local store from BFF when local is empty", async () => {
    storeGetMock.mockResolvedValue(null);
    const plan = await applyBffWorkspaceDriftRepair(
      { authenticated: true, activeWorkspaceId: "WS-A", user: { userId: "u1" } },
      "u1",
    );
    expect(plan).toEqual({ action: "seedLocal", bffId: "WS-A" });
    expect(setActiveMock).not.toHaveBeenCalled();
    expect(storeSetMock).toHaveBeenCalledWith("WS-A");
    expect(bumpRevisionMock).toHaveBeenCalled();
    // Seed may promote durable (G3: storedBefore null).
    expect(storeSetLastForUserMock).toHaveBeenCalledWith("u1", "WS-A");
  });

  it("does nothing when BFF and local already agree", async () => {
    storeGetMock.mockResolvedValue("WS-A");
    const plan = await applyBffWorkspaceDriftRepair(
      { authenticated: true, activeWorkspaceId: "WS-A" },
      "u1",
    );
    expect(plan).toEqual({ action: "noop" });
    expect(setActiveMock).not.toHaveBeenCalled();
    expect(storeSetMock).not.toHaveBeenCalled();
  });
});
