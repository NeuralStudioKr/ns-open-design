import { describe, expect, it } from "vitest";

import {
  buildActiveRunStatusByProjectId,
  resolveRecentProjectDisplayStatus,
} from "../src/teamver/recentProjectDisplayStatus";

describe("recentProjectDisplayStatus", () => {
  it("prefers active run status over registry awaiting_input", () => {
    const active = buildActiveRunStatusByProjectId([
      {
        projectId: "p1",
        projectName: "Deck",
        status: "running",
        count: 1,
      },
    ]);
    expect(
      resolveRecentProjectDisplayStatus("p1", "awaiting_input", active),
    ).toBe("running");
  });

  it("falls back to registry status when no active run", () => {
    const active = buildActiveRunStatusByProjectId([]);
    expect(
      resolveRecentProjectDisplayStatus("p1", "succeeded", active),
    ).toBe("succeeded");
  });

  it("keeps running when both queued and running exist for one project", () => {
    const active = buildActiveRunStatusByProjectId([
      {
        projectId: "p1",
        projectName: "Deck",
        status: "queued",
        count: 1,
      },
      {
        projectId: "p1",
        projectName: "Deck",
        status: "running",
        count: 1,
      },
    ]);
    expect(active.get("p1")).toBe("running");
  });
});
