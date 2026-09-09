/**
 * 0908-N01 slice F — the home rail kept the previous workspace's cards after a
 * switch. Two paths caused it and both reduce to "who painted these rows":
 * a failed refetch retained them, and a successful one unioned them in.
 */
import { describe, expect, it } from "vitest";

import { isProjectListWorkspaceMismatch } from "../../src/teamver/embedProjectListWorkspaceTag";
import { mergeRecentProjectsIntoList } from "../../src/teamver/embedProjectListRefresh";
import type { Project } from "../../src/types";

function project(id: string, updatedAt: number): Project {
  return {
    id,
    name: id,
    skillId: null,
    designSystemId: null,
    createdAt: updatedAt,
    updatedAt,
    status: { value: "not_started" },
  } as Project;
}

describe("isProjectListWorkspaceMismatch", () => {
  it("reports a mismatch when the painted workspace is no longer the active one", () => {
    expect(isProjectListWorkspaceMismatch("WS-A", "WS-B")).toBe(true);
  });

  it("reports no mismatch within one workspace", () => {
    expect(isProjectListWorkspaceMismatch("WS-A", "WS-A")).toBe(false);
    expect(isProjectListWorkspaceMismatch("  WS-A  ", "WS-A")).toBe(false);
  });

  it("stays undecided while either side is unknown", () => {
    // Boot paints before the active-workspace ref is seeded. Calling that a
    // mismatch would wipe the very first rail on every cold entry.
    expect(isProjectListWorkspaceMismatch(null, "WS-B")).toBe(false);
    expect(isProjectListWorkspaceMismatch("WS-A", null)).toBe(false);
    expect(isProjectListWorkspaceMismatch("", "")).toBe(false);
  });
});

describe("home rail apply mode across a workspace switch", () => {
  const paintedByA = [project("a-1", 300), project("a-2", 200)];
  const incomingFromB = [project("b-1", 100)];

  it("unions rows when nothing tells it the workspace moved (the defect)", () => {
    // This is what shipped: `mergeRecentProjectsIntoList(current, incoming)`
    // with no workspace comparison in front of it.
    const merged = mergeRecentProjectsIntoList(paintedByA, incomingFromB);

    expect(merged.map((p) => p.id)).toEqual(["a-1", "a-2", "b-1"]);
  });

  it("replaces instead of merging once the painter is known to differ", () => {
    const replace = isProjectListWorkspaceMismatch("WS-A", "WS-B");
    const merged = mergeRecentProjectsIntoList(
      replace ? [] : paintedByA,
      incomingFromB,
    );

    expect(merged.map((p) => p.id)).toEqual(["b-1"]);
  });

  it("still merges status updates arriving for the same workspace", () => {
    const replace = isProjectListWorkspaceMismatch("WS-A", "WS-A");
    const merged = mergeRecentProjectsIntoList(
      replace ? [] : paintedByA,
      [project("a-3", 400)],
    );

    // Projects-tab pages and detail prefetch rows must survive a recent refresh.
    expect(merged.map((p) => p.id)).toEqual(["a-3", "a-1", "a-2"]);
  });
});
