import { beforeEach, describe, expect, it, vi } from "vitest";

const buildHeadersMock = vi.fn(async (base: Record<string, string>) => ({
  ...base,
  "X-Workspace-Id": "ws-cover",
}));

vi.mock("../src/teamver/teamverDaemonHeaders", () => ({
  buildTeamverDaemonRequestHeaders: (...args: unknown[]) => buildHeadersMock(...args),
}));

import { fetchProjectCoverHints } from "../src/teamver/projectCoverHints";

describe("fetchProjectCoverHints (loop 400)", () => {
  beforeEach(() => {
    buildHeadersMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ hints: [] }),
      })),
    );
  });

  it("forwards embed active workspace on cover-hints batch POST", async () => {
    await fetchProjectCoverHints(["p1", "p2"]);

    expect(buildHeadersMock).toHaveBeenCalledWith({ "content-type": "application/json" });
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/cover-hints",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Workspace-Id": "ws-cover" }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.projectIds).toEqual(["p1", "p2"]);
  });
});
