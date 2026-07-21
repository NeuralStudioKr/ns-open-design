import { afterEach, describe, expect, it, vi } from "vitest";

import * as designApiBase from "../src/teamver/designApiBase";
import * as activeWorkspace from "../src/teamver/activeTeamverWorkspace";
import { clearAllTeamverProjectS3PrefixCache } from "../src/teamver/teamverProjectS3PrefixCache";
import {
  resetTeamverProjectS3PrefixResolveForTests,
  resolveTeamverProjectS3PrefixForDaemon,
} from "../src/teamver/teamverProjectS3PrefixResolve";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  isDesignAuthRefreshDeclined: vi.fn(() => false),
}));

vi.mock("../src/teamver/projectRegistry", () => ({
  fetchTeamverProject: vi.fn(),
}));

describe("resolveTeamverProjectS3PrefixForDaemon", () => {
  afterEach(() => {
    clearAllTeamverProjectS3PrefixCache();
    resetTeamverProjectS3PrefixResolveForTests();
    vi.clearAllMocks();
  });

  it("dedupes concurrent BFF fetches for the same project", async () => {
    const { fetchTeamverProject } = await import("../src/teamver/projectRegistry");
    let resolveFetch: (value: { s3Prefix: string }) => void = () => {};
    const pending = new Promise<{ s3Prefix: string }>((resolve) => {
      resolveFetch = resolve;
    });
    vi.mocked(fetchTeamverProject).mockReturnValue(pending as never);

    const projectId = "p-dedupe";
    const first = resolveTeamverProjectS3PrefixForDaemon("ws-1", projectId);
    const second = resolveTeamverProjectS3PrefixForDaemon("ws-1", projectId);

    resolveFetch({ s3Prefix: "design/ws1/user_u1/proj_dedupe/" });

    await expect(first).resolves.toBe("design/ws1/user_u1/proj_dedupe/");
    await expect(second).resolves.toBe("design/ws1/user_u1/proj_dedupe/");
    expect(fetchTeamverProject).toHaveBeenCalledTimes(1);
  });

  it("skips BFF fetch while soft/hard sticky owns recovery", async () => {
    const { isDesignAuthRefreshDeclined } = await import("../src/teamver/designBffClient");
    const { fetchTeamverProject } = await import("../src/teamver/projectRegistry");
    vi.mocked(isDesignAuthRefreshDeclined).mockReturnValue(true);

    await expect(
      resolveTeamverProjectS3PrefixForDaemon("ws-1", "p-sticky"),
    ).resolves.toBeUndefined();
    expect(fetchTeamverProject).not.toHaveBeenCalled();
  });
});
