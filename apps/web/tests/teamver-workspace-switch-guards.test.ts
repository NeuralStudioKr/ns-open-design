import { describe, expect, it } from "vitest";

import {
  capturePreWorkspaceSwitchProjectGuards,
  isPreWorkspaceSwitchTrustedProject,
  shouldSkipWorkspaceSwitchSideEffects,
} from "../src/teamver/workspaceSwitchGuards";

describe("shouldSkipWorkspaceSwitchSideEffects", () => {
  it("skips when the workspace id is unchanged", () => {
    expect(shouldSkipWorkspaceSwitchSideEffects("ws-1", "ws-1")).toBe(true);
  });

  it("skips first workspace pin when the ref was never seeded", () => {
    expect(shouldSkipWorkspaceSwitchSideEffects(null, "ws-1")).toBe(true);
  });

  it("runs side effects only for a real workspace change", () => {
    expect(shouldSkipWorkspaceSwitchSideEffects("ws-1", "ws-2")).toBe(false);
  });
});

describe("capturePreWorkspaceSwitchProjectGuards", () => {
  it("preserves pending, active-run, and current route project ids", () => {
    const preserved = capturePreWorkspaceSwitchProjectGuards({
      route: { kind: "project", projectId: "route-p", conversationId: null, fileName: null },
      pendingLocalProjectIds: new Set(["pending-p"]),
      sessionActiveRunProjectIds: new Set(["run-p"]),
    });
    expect(preserved).toEqual(new Set(["pending-p", "run-p", "route-p"]));
  });
});

describe("isPreWorkspaceSwitchTrustedProject", () => {
  it("honours the pre-switch snapshot after refs are cleared", () => {
    const preserved = new Set(["keep-me"]);
    expect(isPreWorkspaceSwitchTrustedProject("keep-me", preserved)).toBe(true);
    expect(isPreWorkspaceSwitchTrustedProject("other", preserved)).toBe(false);
  });
});
