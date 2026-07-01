import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTeamverDaemonRequestHeaders, fetchTeamverDaemon } from "../src/teamver/teamverDaemonHeaders";

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

  it("fetchTeamverDaemon forwards workspace header on project API calls", async () => {
    designApiBase.isTeamverEmbedMode.mockReturnValue(true);
    activeWorkspace.readActiveTeamverWorkspaceId.mockResolvedValue("ws-prod");
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTeamverDaemon("/api/projects/p1/files");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/files",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "X-Workspace-Id": "ws-prod" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("fetchTeamverDaemon uses same-origin credentials outside embed", async () => {
    designApiBase.isTeamverEmbedMode.mockReturnValue(false);
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTeamverDaemon("/api/runs");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runs",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    vi.unstubAllGlobals();
  });

  it("dedupes simultaneous daemon GET requests with the same URL and headers", async () => {
    designApiBase.isTeamverEmbedMode.mockReturnValue(true);
    activeWorkspace.readActiveTeamverWorkspaceId.mockResolvedValue("ws-prod");
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchTeamverDaemon("/api/projects/p1/files");
    const second = fetchTeamverDaemon("/api/projects/p1/files");
    await Promise.resolve();
    resolveFetch(new Response(JSON.stringify({ files: [] }), {
      headers: { "content-type": "application/json" },
    }));

    const [firstResp, secondResp] = await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await firstResp.json()).toEqual({ files: [] });
    expect(await secondResp.json()).toEqual({ files: [] });
    vi.unstubAllGlobals();
  });

  it("fetchTeamverDaemon attaches s3 prefix for BYOK proxy via teamverProjectId", async () => {
    designApiBase.isTeamverEmbedMode.mockReturnValue(true);
    activeWorkspace.readActiveTeamverWorkspaceId.mockResolvedValue("ws-1");
    const { rememberTeamverProjectS3Prefix, clearAllTeamverProjectS3PrefixCache } = await import(
      "../src/teamver/teamverProjectS3PrefixCache"
    );
    clearAllTeamverProjectS3PrefixCache();
    const projectId = "9366bf8c-289c-45a0-8d7c-e2939ec7e4fa";
    rememberTeamverProjectS3Prefix("ws-1", projectId, "design/ws1/proj/");

    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTeamverDaemon("/api/proxy/anthropic/stream", {
      method: "POST",
      teamverProjectId: projectId,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/proxy/anthropic/stream",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Teamver-S3-Prefix": "design/ws1/proj/",
        }),
      }),
    );
    vi.unstubAllGlobals();
    clearAllTeamverProjectS3PrefixCache();
  });

  it("fetchTeamverDaemon accepts null teamverProjectId (POST /api/runs without project)", async () => {
    designApiBase.isTeamverEmbedMode.mockReturnValue(true);
    activeWorkspace.readActiveTeamverWorkspaceId.mockResolvedValue("ws-1");
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTeamverDaemon("/api/runs", {
      method: "POST",
      teamverProjectId: null,
      body: "{}",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runs",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "X-Workspace-Id": "ws-1" }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("X-Teamver-S3-Prefix");
    vi.unstubAllGlobals();
  });
});
