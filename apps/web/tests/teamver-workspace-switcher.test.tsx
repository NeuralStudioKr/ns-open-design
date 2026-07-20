// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamverWorkspaceSwitcher } from "../src/teamver/components/TeamverWorkspaceSwitcher";

describe("TeamverWorkspaceSwitcher", () => {
  afterEach(() => {
    cleanup();
  });
  it("shows pending label when active workspace is not resolved yet", () => {
    render(
      <TeamverWorkspaceSwitcher
        workspaces={[{ id: "WS-1", name: "Alpha", role: "owner" }]}
        activeWorkspaceId={null}
        onSwitch={vi.fn()}
      />,
    );
    expect(screen.getByTestId("teamver-workspace-switcher").getAttribute("data-workspace-ready")).toBe(
      "false",
    );
    expect(screen.getByText("워크스페이스 준비 중…")).toBeTruthy();
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
    const menu = scoped.getByTestId("teamver-workspace-menu");
    expect(menu.className).toContain("teamver-workspace-menu--floating");
    expect(menu.style.position).toBe("fixed");
    fireEvent.click(scoped.getByRole("option", { name: /Beta Team/i }));
    expect(onSwitch).toHaveBeenCalledWith("WS-2");
  });

  it("does not call onSwitch when selecting the already-active workspace", () => {
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
    fireEvent.click(scoped.getByRole("option", { name: /Alpha/i }));
    expect(onSwitch).not.toHaveBeenCalled();
    expect(scoped.queryByRole("listbox")).toBeNull();
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
        name: /Beta Team \(비활성\)/i,
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
        name: /Beta Team \(비활성\)/i,
      }),
    );
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("marks the active workspace option as selected with a check affordance", () => {
    const view = render(
      <TeamverWorkspaceSwitcher
        workspaces={[
          { id: "WS-1", name: "Alpha", role: "owner" },
          { id: "WS-2", name: "Beta Team", role: "member" },
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
    const activeOption = within(view.getByTestId("teamver-workspace-switcher")).getByRole(
      "option",
      { name: /Alpha/i },
    );
    expect(activeOption.getAttribute("aria-selected")).toBe("true");
    expect(activeOption.className).toContain("is-active");
    expect(activeOption.querySelector(".teamver-workspace-menu__check")).toBeTruthy();
  });

  it("moves focus between options with arrow keys", () => {
    const view = render(
      <TeamverWorkspaceSwitcher
        workspaces={[
          { id: "WS-1", name: "Alpha", role: "owner" },
          { id: "WS-2", name: "Beta Team", role: "member" },
          { id: "WS-3", name: "Gamma", role: "member" },
        ]}
        activeWorkspaceId="WS-1"
        onSwitch={vi.fn()}
      />,
    );

    const scoped = within(view.getByTestId("teamver-workspace-switcher"));
    fireEvent.click(scoped.getByRole("button", { name: /워크스페이스: Alpha/i }));
    const menu = scoped.getByTestId("teamver-workspace-menu");
    const alpha = scoped.getByRole("option", { name: /Alpha/i });
    const beta = scoped.getByRole("option", { name: /Beta Team/i });
    expect(document.activeElement).toBe(alpha);

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(beta);

    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(scoped.getByRole("option", { name: /Gamma/i }));

    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(alpha);
  });

  it("keeps keyboard focus on the navigated option after menu reposition", () => {
    const view = render(
      <TeamverWorkspaceSwitcher
        workspaces={[
          { id: "WS-1", name: "Alpha", role: "owner" },
          { id: "WS-2", name: "Beta Team", role: "member" },
        ]}
        activeWorkspaceId="WS-1"
        onSwitch={vi.fn()}
      />,
    );

    const scoped = within(view.getByTestId("teamver-workspace-switcher"));
    fireEvent.click(scoped.getByRole("button", { name: /워크스페이스: Alpha/i }));
    const menu = scoped.getByTestId("teamver-workspace-menu");
    const beta = scoped.getByRole("option", { name: /Beta Team/i });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(beta);

    fireEvent(window, new Event("resize"));
    expect(document.activeElement).toBe(beta);
  });
});
