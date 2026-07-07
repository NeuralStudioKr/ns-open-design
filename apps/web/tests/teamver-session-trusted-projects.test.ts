import { describe, expect, it } from "vitest";

import { isTeamverSessionTrustedProject } from "../src/teamver/sessionTrustedProjects";

describe("isTeamverSessionTrustedProject", () => {
  it("trusts projects created in the current session before registry list catches up", () => {
    expect(
      isTeamverSessionTrustedProject("p-new", {
        pendingLocalProjectIds: new Set(["p-new"]),
      }),
    ).toBe(true);
  });

  it("trusts projects with active background runs during page re-entry", () => {
    expect(
      isTeamverSessionTrustedProject("p-running", {
        sessionActiveRunProjectIds: new Set(["p-running"]),
      }),
    ).toBe(true);
  });

  it("does not trust empty or unknown project ids", () => {
    expect(
      isTeamverSessionTrustedProject("  ", {
        pendingLocalProjectIds: new Set(["p-new"]),
        sessionActiveRunProjectIds: new Set(["p-running"]),
      }),
    ).toBe(false);
    expect(
      isTeamverSessionTrustedProject("p-other", {
        pendingLocalProjectIds: new Set(["p-new"]),
        sessionActiveRunProjectIds: new Set(["p-running"]),
      }),
    ).toBe(false);
  });
});
