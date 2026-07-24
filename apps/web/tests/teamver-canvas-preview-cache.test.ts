import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The BFF layer (getDesignBffClient / auth helpers) is heavy — mock it out so
// the cache logic under test stays isolated from network + workspace state.
const httpGet = vi.fn(async () => ({
  sessionId: "s1",
  artifactId: "artifact-12345678",
  title: "Live 제목",
}));

vi.mock("../src/teamver/designBffClient", () => ({
  TEAMVER_BFF_REQUEST_OPTIONS: {},
  getDesignBffClient: () => ({ http: { get: httpGet } }),
  shouldSkipTeamverBffAuthCalls: () => false,
  withDesignBffCookieAuthRecovery: async (
    op: () => Promise<unknown>,
  ) => op(),
}));
vi.mock("../src/teamver/activeTeamverWorkspace", () => ({
  requireActiveTeamverWorkspaceId: async () => "WS-1",
}));
vi.mock("../src/teamver/teamverDesignAccess", () => ({
  assertTeamverDesignAppEnabled: async () => undefined,
}));

const {
  fetchTeamverCanvasPreview,
  __resetTeamverCanvasPreviewCacheForTests,
} = await import("../src/teamver/fetchCanvasPreview");

describe("fetchTeamverCanvasPreview (per-artifact TTL cache)", () => {
  beforeEach(() => {
    __resetTeamverCanvasPreviewCacheForTests();
    httpGet.mockClear();
  });

  afterEach(() => {
    __resetTeamverCanvasPreviewCacheForTests();
  });

  it("returns enriched preview and only hits the BFF once for the same artifact", async () => {
    const first = await fetchTeamverCanvasPreview({
      sessionId: "s1",
      artifactId: "artifact-12345678",
    });
    expect(first?.title).toBe("Live 제목");
    expect(httpGet).toHaveBeenCalledTimes(1);

    const second = await fetchTeamverCanvasPreview({
      sessionId: "s1",
      artifactId: "artifact-12345678",
    });
    expect(second?.title).toBe("Live 제목");
    // Cached — no additional BFF call within the TTL window.
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it("uses a distinct cache slot per (sessionId, artifactId) pair", async () => {
    await fetchTeamverCanvasPreview({ sessionId: "s1", artifactId: "artifact-a" });
    await fetchTeamverCanvasPreview({ sessionId: "s2", artifactId: "artifact-b" });
    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it("coalesces parallel calls for the same key into a single in-flight fetch", async () => {
    const [a, b, c] = await Promise.all([
      fetchTeamverCanvasPreview({ sessionId: "s1", artifactId: "artifact-1" }),
      fetchTeamverCanvasPreview({ sessionId: "s1", artifactId: "artifact-1" }),
      fetchTeamverCanvasPreview({ sessionId: "s1", artifactId: "artifact-1" }),
    ]);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it("still caches a null result when the BFF returns nothing so failure paths don't stampede", async () => {
    httpGet.mockRejectedValueOnce(new Error("boom"));
    const first = await fetchTeamverCanvasPreview({
      sessionId: "s-err",
      artifactId: "artifact-err",
    });
    expect(first).toBeNull();
    const second = await fetchTeamverCanvasPreview({
      sessionId: "s-err",
      artifactId: "artifact-err",
    });
    expect(second).toBeNull();
    // Second lookup was served from the cache; underlying fetch fires exactly once.
    expect(httpGet).toHaveBeenCalledTimes(1);
  });
});
