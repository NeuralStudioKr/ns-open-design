/**
 * 0908-N01 F / H — decision table for home·projects rail after a list fetch.
 * App used to wire drop/replace/merge by hand; these cases are the contract
 * that painted=null deeplink leaks and cross-WS unions must not reappear.
 */
import { describe, expect, it } from "vitest";

import {
  decideProjectListPaintAction,
  type ProjectListPaintAction,
} from "../../src/teamver/embedProjectListWorkspaceTag";
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

function decide(partial: {
  outcome: "success" | "failure";
  request?: string | null;
  painted?: string | null;
  active?: string | null;
  hasPaintedRows?: boolean;
}): ProjectListPaintAction {
  return decideProjectListPaintAction({
    outcome: partial.outcome,
    requestWorkspaceId: partial.request ?? "WS-B",
    paintedWorkspaceId: partial.painted ?? null,
    activeWorkspaceId: partial.active ?? "WS-B",
    hasPaintedRows: partial.hasPaintedRows ?? false,
  });
}

describe("decideProjectListPaintAction — home recent / projects paths", () => {
  it("retains rows on transient failure within the same workspace", () => {
    expect(
      decide({
        outcome: "failure",
        request: "WS-A",
        painted: "WS-A",
        active: "WS-A",
        hasPaintedRows: true,
      }),
    ).toBe("retain");
  });

  it("clears rows on failure after a workspace switch (slice F)", () => {
    expect(
      decide({
        outcome: "failure",
        request: "WS-B",
        painted: "WS-A",
        active: "WS-B",
        hasPaintedRows: true,
      }),
    ).toBe("clear");
  });

  it("clears untagged deeplink-prefetched rows once active WS is known (H3)", () => {
    expect(
      decide({
        outcome: "failure",
        request: "WS-B",
        painted: null,
        active: "WS-B",
        hasPaintedRows: true,
      }),
    ).toBe("clear");
  });

  it("does not clear an empty cold-boot rail when painted is still unknown", () => {
    expect(
      decide({
        outcome: "failure",
        request: "WS-B",
        painted: null,
        active: "WS-B",
        hasPaintedRows: false,
      }),
    ).toBe("retain");
  });

  it("merges status updates for the same workspace", () => {
    expect(
      decide({
        outcome: "success",
        request: "WS-A",
        painted: "WS-A",
        active: "WS-A",
        hasPaintedRows: true,
      }),
    ).toBe("merge");
  });

  it("replaces instead of unioning across workspaces", () => {
    expect(
      decide({
        outcome: "success",
        request: "WS-B",
        painted: "WS-A",
        active: "WS-B",
        hasPaintedRows: true,
      }),
    ).toBe("replace");
  });

  it("ignores a stale in-flight response after a switch (loadMore / append)", () => {
    expect(
      decide({
        outcome: "success",
        request: "WS-A",
        painted: "WS-B",
        active: "WS-B",
        hasPaintedRows: true,
      }),
    ).toBe("ignore-stale");
  });
});

describe("home rail apply — replace vs union", () => {
  const paintedByA = [project("a-1", 300), project("a-2", 200)];
  const fromB = [project("b-1", 100)];

  it("applies replace when the decision table says so", () => {
    const action = decide({
      outcome: "success",
      request: "WS-B",
      painted: "WS-A",
      active: "WS-B",
      hasPaintedRows: true,
    });
    const next = mergeRecentProjectsIntoList(
      action === "replace" ? [] : paintedByA,
      fromB,
    );
    expect(action).toBe("replace");
    expect(next.map((p) => p.id)).toEqual(["b-1"]);
  });
});
