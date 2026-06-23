import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPermissionsMock = vi.fn();

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  fetchTeamverWorkspacePermissions: (...args: unknown[]) => fetchPermissionsMock(...args),
}));

import {
  assertTeamverDesignAppEnabled,
  isTeamverDesignAppEnabled,
  isTeamverEmbedDriveImportAllowed,
  readTeamverDesignAccessSnapshot,
  snapshotFromWorkspace,
  updateTeamverDesignAccessSnapshot,
} from "../src/teamver/teamverDesignAccess";

describe("teamverDesignAccess", () => {
  beforeEach(() => {
    fetchPermissionsMock.mockReset();
    updateTeamverDesignAccessSnapshot("WS-1", true, null);
  });

  it("tracks disabled workspace in snapshot", () => {
    snapshotFromWorkspace("WS-2", {
      id: "WS-2",
      name: "Blocked",
      appEnabled: false,
      appDisabledReason: "app_disabled_globally",
    });
    const snapshot = readTeamverDesignAccessSnapshot();
    expect(snapshot?.workspaceId).toBe("WS-2");
    expect(snapshot?.appEnabled).toBe(false);
    expect(isTeamverDesignAppEnabled("WS-2")).toBe(false);
  });

  it("assert rejects when permissions report app disabled", async () => {
    fetchPermissionsMock.mockResolvedValue({
      appEnabled: false,
      appDisabledReason: "app_disabled_workspace",
    });

    await expect(assertTeamverDesignAppEnabled("WS-1")).rejects.toThrow(
      "app_disabled_workspace",
    );
    expect(readTeamverDesignAccessSnapshot()?.appEnabled).toBe(false);
  });

  it("assert passes when permissions report app enabled", async () => {
    fetchPermissionsMock.mockResolvedValue({
      appEnabled: true,
      appDisabledReason: null,
    });

    await expect(assertTeamverDesignAppEnabled("WS-1")).resolves.toBeUndefined();
    expect(readTeamverDesignAccessSnapshot()?.appEnabled).toBe(true);
  });

  it("falls back to snapshot when permissions fetch is unavailable", async () => {
    updateTeamverDesignAccessSnapshot("WS-1", false, "design_app_disabled");
    fetchPermissionsMock.mockResolvedValue(null);

    await expect(assertTeamverDesignAppEnabled("WS-1")).rejects.toThrow(
      "design_app_disabled",
    );
  });

  it("blocks embed Drive import when Design app is disabled", () => {
    updateTeamverDesignAccessSnapshot("WS-1", false, "design_app_disabled");
    expect(
      isTeamverEmbedDriveImportAllowed({
        bffPresent: true,
        workspaceId: "WS-1",
      }),
    ).toBe(false);
  });

  it("allows embed Drive import when BFF and workspace are ready", () => {
    updateTeamverDesignAccessSnapshot("WS-1", true, null);
    expect(
      isTeamverEmbedDriveImportAllowed({
        bffPresent: true,
        workspaceId: "WS-1",
      }),
    ).toBe(true);
  });

  it("requires workspace id for embed Drive import", () => {
    updateTeamverDesignAccessSnapshot("WS-1", true, null);
    expect(
      isTeamverEmbedDriveImportAllowed({
        bffPresent: true,
        workspaceId: null,
      }),
    ).toBe(false);
  });
});
