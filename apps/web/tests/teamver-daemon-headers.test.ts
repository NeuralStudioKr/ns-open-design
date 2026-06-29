import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as designApiBase from "../src/teamver/designApiBase";
import * as activeWorkspace from "../src/teamver/activeTeamverWorkspace";
import {
  rememberTeamverProjectS3Prefix,
  clearAllTeamverProjectS3PrefixCache,
  readTeamverProjectS3Prefix,
} from "../src/teamver/teamverProjectS3PrefixCache";
import { resetTeamverProjectS3PrefixResolveForTests } from "../src/teamver/teamverProjectS3PrefixResolve";
import { buildTeamverDaemonRequestHeaders } from "../src/teamver/teamverDaemonHeaders";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/activeTeamverWorkspace", () => ({
  readActiveTeamverWorkspaceId: vi.fn(async () => "ws-1"),
}));

vi.mock("../src/teamver/projectRegistry", () => ({
  fetchTeamverProject: vi.fn(),
}));

describe("teamver daemon request headers", () => {
  beforeEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(activeWorkspace.readActiveTeamverWorkspaceId).mockResolvedValue("ws-1");
    clearAllTeamverProjectS3PrefixCache();
  });

  afterEach(() => {
    clearAllTeamverProjectS3PrefixCache();
    resetTeamverProjectS3PrefixResolveForTests();
    vi.clearAllMocks();
  });

  it("forwards workspace and cached s3 prefix for a project-scoped call", async () => {
    const projectId = "9366bf8c-289c-45a0-8d7c-e2939ec7e4fa";
    rememberTeamverProjectS3Prefix(
      "ws-1",
      projectId,
      "design/ws_ws1/user_u1/proj_od1/",
    );

    const headers = await buildTeamverDaemonRequestHeaders(
      { "Content-Type": "application/json" },
      { projectId },
    );

    expect(headers["X-Workspace-Id"]).toBe("ws-1");
    expect(headers["X-Teamver-S3-Prefix"]).toBe("design/ws_ws1/user_u1/proj_od1/");
  });

  it("lazy-loads s3 prefix from BFF when cache is cold", async () => {
    const { fetchTeamverProject } = await import("../src/teamver/projectRegistry");
    const projectId = "0ecfa702-58ac-4d6e-9b63-856e2b071fa3";
    vi.mocked(fetchTeamverProject).mockResolvedValue({
      odProjectId: projectId,
      s3Prefix: "design/ws1/user_u1/proj_cold/",
    });

    const headers = await buildTeamverDaemonRequestHeaders({}, { projectId });

    expect(fetchTeamverProject).toHaveBeenCalledWith(projectId);
    expect(headers["X-Teamver-S3-Prefix"]).toBe("design/ws1/user_u1/proj_cold/");
    expect(readTeamverProjectS3Prefix("ws-1", projectId)).toBe(
      "design/ws1/user_u1/proj_cold/",
    );
  });
});
