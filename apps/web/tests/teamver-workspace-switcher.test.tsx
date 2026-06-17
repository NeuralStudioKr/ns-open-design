// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamverWorkspaceSwitcher } from "../src/teamver/components/TeamverWorkspaceSwitcher";

describe("TeamverWorkspaceSwitcher", () => {
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
    render(
      <TeamverWorkspaceSwitcher
        workspaces={[
          { id: "WS-1", name: "Alpha", role: "owner" },
          { id: "WS-2", name: "Beta Team", role: "member" },
        ]}
        activeWorkspaceId="WS-1"
        onSwitch={onSwitch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Workspace: Alpha/i }));
    fireEvent.click(screen.getByRole("option", { name: /Beta Team/i }));
    expect(onSwitch).toHaveBeenCalledWith("WS-2");
  });
});
