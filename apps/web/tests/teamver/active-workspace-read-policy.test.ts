import { describe, expect, it } from "vitest";

import { resolveActiveWorkspaceIdForRead } from "../../src/teamver/activeWorkspaceReadPolicy";
import { mayPromoteWorkspaceToDurablePreference } from "../../src/teamver/workspaceDurablePreference";
import { normalizeWorkspaceList } from "../../src/teamver/workspaceUtils";

const list = (
  ...entries: Array<{ id: string; appEnabled?: boolean; isAccountDefaultWorkspace?: boolean }>
) => normalizeWorkspaceList(entries.map((entry) => ({ name: entry.id, role: "owner", ...entry })));

describe("resolveActiveWorkspaceIdForRead", () => {
  it("keeps the stored pick when the session carries no workspace list", () => {
    // A payload that omits or truncates `workspaces` is not a revocation
    // notice. Reading it as one is how a single flake moved the user.
    expect(
      resolveActiveWorkspaceIdForRead({
        storedId: "WS-picked",
        workspaces: [],
        defaultWorkspaceId: "WS-default",
        durablePreferenceId: "WS-picked",
      }),
    ).toBe("WS-picked");
  });

  it("keeps the stored pick when it is still listed", () => {
    expect(
      resolveActiveWorkspaceIdForRead({
        storedId: "WS-picked",
        workspaces: list({ id: "WS-picked" }, { id: "WS-default" }),
        defaultWorkspaceId: "WS-default",
      }),
    ).toBe("WS-picked");
  });

  it("answers with the durable pick before the account default", () => {
    expect(
      resolveActiveWorkspaceIdForRead({
        storedId: "WS-gone",
        workspaces: list({ id: "WS-last" }, { id: "WS-default" }),
        defaultWorkspaceId: "WS-default",
        durablePreferenceId: "WS-last",
      }),
    ).toBe("WS-last");
  });

  it("answers with a listed workspace so the request cannot deadlock", () => {
    expect(
      resolveActiveWorkspaceIdForRead({
        storedId: "WS-gone",
        workspaces: list({ id: "WS-default" }),
        defaultWorkspaceId: "WS-default",
      }),
    ).toBe("WS-default");
  });

  it("falls back to the stored pick when nothing on the list is usable", () => {
    // `pickDefaultWorkspaceId` returns null only for an empty pool; guard the
    // shape anyway so a future filter cannot silently produce a null header.
    expect(
      resolveActiveWorkspaceIdForRead({
        storedId: "WS-picked",
        workspaces: list({ id: "" }),
        defaultWorkspaceId: null,
      }),
    ).toBe("WS-picked");
  });
});

describe("mayPromoteWorkspaceToDurablePreference", () => {
  it("blocks only an unrequested move away from an existing pick", () => {
    expect(
      mayPromoteWorkspaceToDurablePreference({
        storedBefore: "WS-picked",
        resolved: "WS-default",
        requestedByCaller: false,
      }),
    ).toBe(false);
  });

  it("allows an explicitly requested switch", () => {
    expect(
      mayPromoteWorkspaceToDurablePreference({
        storedBefore: "WS-picked",
        resolved: "WS-default",
        requestedByCaller: true,
      }),
    ).toBe(true);
  });

  it("allows a first-ever seed — there is no earlier pick to protect", () => {
    expect(
      mayPromoteWorkspaceToDurablePreference({
        storedBefore: null,
        resolved: "WS-default",
        requestedByCaller: false,
      }),
    ).toBe(true);
  });

  it("allows re-confirming the workspace already stored", () => {
    expect(
      mayPromoteWorkspaceToDurablePreference({
        storedBefore: "WS-picked",
        resolved: "WS-picked",
        requestedByCaller: false,
      }),
    ).toBe(true);
  });
});
