// @vitest-environment jsdom
/**
 * 0908-N01 slice G (risk 3) — `beginProjectListRequest` stamps each project
 * list request with the workspace it belongs to, but the ref it read is only
 * filled after the boot-wait effect resolves. Boot-time requests therefore
 * carried `null`, and the staleness check returns false for an unknown side,
 * so no workspace change could ever invalidate them. Slice F's painted tag
 * blocked the visible result; this closes the cause.
 */
import { describe, expect, it } from "vitest";

import {
  isProjectListWorkspaceStale,
  resolveProjectListWorkspaceId,
} from "../../src/teamver/embedProjectListWorkspaceTag";
import {
  TEAMVER_ACTIVE_WORKSPACE_STORAGE_KEY,
  readTeamverActiveWorkspaceIdSnapshot,
} from "../../src/teamver/activeWorkspaceIdSnapshot";

describe("readTeamverActiveWorkspaceIdSnapshot", () => {
  it("reads the store's active key synchronously", () => {
    localStorage.setItem(TEAMVER_ACTIVE_WORKSPACE_STORAGE_KEY, " WS-picked ");
    expect(readTeamverActiveWorkspaceIdSnapshot()).toBe("WS-picked");
  });

  it("reports null for a first-ever entry", () => {
    localStorage.removeItem(TEAMVER_ACTIVE_WORKSPACE_STORAGE_KEY);
    expect(readTeamverActiveWorkspaceIdSnapshot()).toBeNull();
  });
});

describe("resolveProjectListWorkspaceId", () => {
  it("uses the stored snapshot while the ref is still empty (boot)", () => {
    expect(resolveProjectListWorkspaceId(null, "WS-picked")).toBe("WS-picked");
  });

  it("prefers the ref once it exists", () => {
    expect(resolveProjectListWorkspaceId("WS-switched", "WS-picked")).toBe("WS-switched");
  });

  it("does not let the snapshot mask the boot-flush sentinel", () => {
    // `App` poisons the ref with this sentinel to force one re-dispatch of a
    // switch that landed before boot finished. Falling back to the snapshot
    // here would erase that signal.
    expect(resolveProjectListWorkspaceId("\0boot-flush:WS-b", "WS-a")).toBe("\0boot-flush:WS-b");
  });

  it("reports null when neither side knows", () => {
    expect(resolveProjectListWorkspaceId(null, null)).toBeNull();
  });
});

describe("isProjectListWorkspaceStale", () => {
  it("invalidates a boot request once boot reconciled onto another workspace", () => {
    // The case risk 3 named: before this slice the request side was `null`, so
    // this returned false and the apply landed regardless.
    const request = resolveProjectListWorkspaceId(null, "WS-picked");
    expect(isProjectListWorkspaceStale(request, "WS-reconciled")).toBe(true);
  });

  it("keeps a request that never left its workspace", () => {
    expect(isProjectListWorkspaceStale("WS-picked", "WS-picked")).toBe(false);
  });

  it("does not decide when either side is unknown", () => {
    expect(isProjectListWorkspaceStale(null, "WS-picked")).toBe(false);
    expect(isProjectListWorkspaceStale("WS-picked", null)).toBe(false);
  });
});
