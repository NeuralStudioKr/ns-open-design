import { describe, expect, it } from "vitest";
import {
  normalizeWorkspaceList,
  pickDefaultWorkspaceId,
  readWorkspaceId,
  readWorkspaceLabel,
  workspaceInitial,
  formatWorkspaceMenuLabel,
  isWorkspaceAppEnabled,
} from "../src/teamver/workspaceUtils";

describe("workspaceUtils", () => {
  it("reads workspace id from workspaceId snake/camel fields", () => {
    expect(readWorkspaceId({ workspace_id: "WS-1" })).toBe("WS-1");
    expect(readWorkspaceId({ workspaceId: "WS-2" })).toBe("WS-2");
    expect(readWorkspaceId({ id: "WS-3" })).toBe("WS-3");
  });

  it("normalizes duplicate workspace ids", () => {
    const list = normalizeWorkspaceList([
      { workspace_id: "WS-1", name: "Alpha" },
      { workspaceId: "WS-1", name: "Dup" },
      { id: "WS-2", name: "Beta" },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe("WS-1");
  });

  it("picks preferred workspace when still valid", () => {
    const workspaces = normalizeWorkspaceList([
      { id: "WS-1", name: "One", role: "member" },
      { id: "WS-2", name: "Two", role: "owner", is_account_default_workspace: true },
    ]);
    expect(
      pickDefaultWorkspaceId(workspaces, {
        preferredId: "WS-1",
        defaultWorkspaceId: "WS-2",
      }),
    ).toBe("WS-1");
  });

  it("falls back to account default workspace", () => {
    const workspaces = normalizeWorkspaceList([
      { id: "WS-1", name: "One", role: "member" },
      { id: "WS-2", name: "Two", role: "owner", isAccountDefaultWorkspace: true },
    ]);
    expect(pickDefaultWorkspaceId(workspaces, { preferredId: "WS-missing" })).toBe("WS-2");
  });

  it("builds workspace label and initial", () => {
    expect(readWorkspaceLabel({ name: "Acme Design" })).toBe("Acme Design");
    expect(workspaceInitial({ name: "Acme Design" })).toBe("AD");
  });

  it("formats disabled workspace menu label", () => {
    expect(
      formatWorkspaceMenuLabel({ name: "Acme", app_enabled: false }),
    ).toBe("Acme (Disabled)");
    expect(isWorkspaceAppEnabled({ app_enabled: false })).toBe(false);
  });

  it("prefers enabled workspaces for default pick", () => {
    const workspaces = normalizeWorkspaceList([
      { id: "WS-1", name: "Disabled", app_enabled: false },
      { id: "WS-2", name: "Enabled", app_enabled: true },
    ]);
    expect(pickDefaultWorkspaceId(workspaces)).toBe("WS-2");
    expect(workspaces[0]?.appEnabled).toBe(false);
    expect(workspaces[1]?.appEnabled).toBe(true);
  });
});
