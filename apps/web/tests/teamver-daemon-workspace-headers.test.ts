import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTeamverDaemonRequestHeaders } from "../src/teamver/teamverDaemonHeaders";

const designApiBase = vi.hoisted(() => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

const activeWorkspace = vi.hoisted(() => ({
  readActiveTeamverWorkspaceId: vi.fn(async () => null as string | null),
}));

vi.mock("../src/teamver/designApiBase", () => designApiBase);
vi.mock("../src/teamver/activeTeamverWorkspace", () => activeWorkspace);

describe("buildTeamverDaemonRequestHeaders", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns base headers outside embed mode", async () => {
    designApiBase.isTeamverEmbedMode.mockReturnValue(false);
    const headers = await buildTeamverDaemonRequestHeaders({ "X-OD-Client": "web" });
    expect(headers).toEqual({ "X-OD-Client": "web" });
    expect(activeWorkspace.readActiveTeamverWorkspaceId).not.toHaveBeenCalled();
  });

  it("adds X-Workspace-Id from active store in embed mode", async () => {
    designApiBase.isTeamverEmbedMode.mockReturnValue(true);
    activeWorkspace.readActiveTeamverWorkspaceId.mockResolvedValue("ws-active");
    const headers = await buildTeamverDaemonRequestHeaders({
      "Content-Type": "application/json",
      "X-OD-Client": "web",
    });
    expect(headers["X-Workspace-Id"]).toBe("ws-active");
  });

  it("omits workspace header when store is empty", async () => {
    designApiBase.isTeamverEmbedMode.mockReturnValue(true);
    activeWorkspace.readActiveTeamverWorkspaceId.mockResolvedValue(null);
    const headers = await buildTeamverDaemonRequestHeaders({ "X-OD-Client": "web" });
    expect(headers).not.toHaveProperty("X-Workspace-Id");
  });
});
