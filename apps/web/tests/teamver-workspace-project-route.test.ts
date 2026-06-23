import { describe, expect, it } from "vitest";

import { shouldNavigateHomeAfterWorkspaceProjectList } from "../src/teamver/teamverWorkspaceProjectRoute";

describe("shouldNavigateHomeAfterWorkspaceProjectList", () => {
  it("returns false on non-project routes", () => {
    expect(
      shouldNavigateHomeAfterWorkspaceProjectList({ kind: "home", view: "home" }, [
        { id: "p1" },
      ]),
    ).toBe(false);
  });

  it("returns false when the routed project is still in the workspace list", () => {
    expect(
      shouldNavigateHomeAfterWorkspaceProjectList(
        { kind: "project", projectId: "p1", conversationId: null, fileName: null },
        [{ id: "p1" }, { id: "p2" }],
      ),
    ).toBe(false);
  });

  it("returns true when the routed project is absent after workspace refresh", () => {
    expect(
      shouldNavigateHomeAfterWorkspaceProjectList(
        { kind: "project", projectId: "stale", conversationId: null, fileName: null },
        [{ id: "p1" }],
      ),
    ).toBe(true);
  });
});
