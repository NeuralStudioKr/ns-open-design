import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchDaemonMock = vi.fn(
  async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = {
      ...Object.fromEntries(new Headers(init.headers)),
      "X-Workspace-Id": "ws-cover",
    };
    return fetch(input, { ...init, headers });
  },
);

vi.mock("../src/teamver/teamverDaemonHeaders", () => ({
  fetchTeamverDaemon: (...args: unknown[]) => fetchDaemonMock(...args),
}));

import { fetchProjectCoverHints, projectCoverFileFromHint } from "../src/teamver/projectCoverHints";

describe("fetchProjectCoverHints (loop 400)", () => {
  beforeEach(() => {
    fetchDaemonMock.mockClear();
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

    expect(fetchDaemonMock).toHaveBeenCalledWith(
      "/api/projects/cover-hints",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
      }),
    );
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

  it("drops unsafe cover hint paths before building project raw URLs", () => {
    expect(
      projectCoverFileFromHint({
        projectId: "p1",
        coverKind: "html",
        coverPath: "../outside.html",
      }),
    ).toBeNull();
    expect(
      projectCoverFileFromHint({
        projectId: "p1",
        coverKind: "html",
        entryFile: "https://example.com/deck.html",
      }),
    ).toBeNull();
    expect(
      projectCoverFileFromHint({
        projectId: "p1",
        coverKind: "html",
        coverPath: "slides/deck.html",
      }),
    ).toEqual({ kind: "html", name: "slides/deck.html", version: undefined });
  });
});
