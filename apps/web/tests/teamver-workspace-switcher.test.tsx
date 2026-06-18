// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamverWorkspaceSwitcher } from "../src/teamver/components/TeamverWorkspaceSwitcher";

describe("TeamverWorkspaceSwitcher", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders single workspace chip without menu", () => {
    render(
      <TeamverWorkspaceSwitcher
        workspaces={[{ id: "WS-1", name: "Alpha", role: "owner" }]}
        activeWorkspaceId="WS-1"
        onSwitch={vi.fn()}
      />,
    );
    expect(screen.getByTestId("teamver-workspace-chip")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens menu and switches workspace", () => {
    const onSwitch = vi.fn();
    const view = render(
      <TeamverWorkspaceSwitcher
        workspaces={[
          { id: "WS-1", name: "Alpha", role: "owner" },
          { id: "WS-2", name: "Beta Team", role: "member" },
        ]}
        activeWorkspaceId="WS-1"
        onSwitch={onSwitch}
      />,
    );

    const scoped = within(view.getByTestId("teamver-workspace-switcher"));
    fireEvent.click(scoped.getByRole("button", { name: /워크스페이스: Alpha/i }));
    fireEvent.click(scoped.getByRole("option", { name: /Beta Team/i }));
    expect(onSwitch).toHaveBeenCalledWith("WS-2");
  });

  it("shows disabled hint in workspace menu", () => {
    const view = render(
      <TeamverWorkspaceSwitcher
        workspaces={[
          { id: "WS-1", name: "Alpha", role: "owner", appEnabled: true },
          { id: "WS-2", name: "Beta Team", role: "member", appEnabled: false },
        ]}
        activeWorkspaceId="WS-1"
        onSwitch={vi.fn()}
      />,
    );

    fireEvent.click(
      within(view.getByTestId("teamver-workspace-switcher")).getByRole("button", {
        name: /워크스페이스: Alpha/i,
      }),
    );
    expect(
      within(view.getByTestId("teamver-workspace-switcher")).getByRole("option", {
        name: /Beta Team \(Disabled\)/i,
      }),
    ).toBeTruthy();
  });

  it("does not switch to a disabled workspace", () => {
    const onSwitch = vi.fn();
    const view = render(
      <TeamverWorkspaceSwitcher
        workspaces={[
          { id: "WS-1", name: "Alpha", role: "owner", appEnabled: true },
          { id: "WS-2", name: "Beta Team", role: "member", appEnabled: false },
        ]}
        activeWorkspaceId="WS-1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.click(
      within(view.getByTestId("teamver-workspace-switcher")).getByRole("button", {
        name: /워크스페이스: Alpha/i,
      }),
    );
    fireEvent.click(
      within(view.getByTestId("teamver-workspace-switcher")).getByRole("option", {
        name: /Beta Team \(Disabled\)/i,
      }),
    );
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
