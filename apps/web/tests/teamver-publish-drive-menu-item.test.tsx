// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const getWorkspaceMock = vi.fn(async () => "ws-1");
const listTargetsMock = vi.fn(async (_workspaceId: string, _options?: { limit?: number }) => [
  {
    id: "personal-root",
    label: "My Drive",
    description: "Personal drive root",
    folderId: "FLD-MY-ROOT",
    sharedDriveId: null,
  },
  {
    id: "shared:SD-1:FLD-EXPORTS",
    label: "Product / Exports",
    description: "Team drive folder",
    folderId: "FLD-EXPORTS",
    sharedDriveId: "SD-1",
  },
]);
const searchTargetsMock = vi.fn(async (_workspaceId: string, _query: string, _options?: { limit?: number }) => [
  {
    id: "shared:SD-2:FLD-REMOTE",
    label: "Marketing / Launch exports",
    description: "Team drive folder search result",
    folderId: "FLD-REMOTE",
    sharedDriveId: "SD-2",
  },
]);
const listImportScopesMock = vi.fn(async (_workspaceId: string) => [
  { mode: "personal" as const, folderId: null, label: "My Drive" },
  { mode: "shared" as const, sharedDriveId: "SD-1", folderId: null, label: "Product" },
]);
const listImportRowsMock = vi.fn(async (_args: unknown) => [
  { kind: "folder" as const, folderId: "FLD-BROWSE", name: "Browse exports", sharedDriveId: null },
]);
const publishMock = vi.fn(async (_args: unknown) => ({
  projectId: "DPRJ-1",
  partial: false,
  outputs: [
    {
      id: "DOUT-1",
      kind: "html",
      driveAssetId: "AST-1",
      filename: "Deck.html",
      publishStatus: "ready",
    },
  ],
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    workspaceStore: { get: getWorkspaceMock },
  })),
}));

vi.mock("../src/teamver/drivePublishTargets", () => ({
  listTeamverDrivePublishTargets: (workspaceId: string, options?: { limit?: number }) =>
    listTargetsMock(workspaceId, options),
  searchTeamverDrivePublishTargets: (
    workspaceId: string,
    query: string,
    options?: { limit?: number },
  ) => searchTargetsMock(workspaceId, query, options),
  TEAMVER_DRIVE_PUBLISH_SEARCH_MIN: 2,
}));

vi.mock("../src/teamver/driveImportList", () => ({
  listTeamverDriveImportScopes: (workspaceId: string) => listImportScopesMock(workspaceId),
  listTeamverDriveImportRows: (args: unknown) => listImportRowsMock(args),
}));

vi.mock("../src/teamver/publishToDrive", () => ({
  publishTeamverDesignToDrive: (args: unknown) => publishMock(args),
  pickReadyPublishOutputs: (outputs: Array<{ publishStatus?: string }>) =>
    outputs.filter((output) => output.publishStatus === "ready"),
}));

import { TeamverPublishDriveMenuItem } from "../src/teamver/components/TeamverPublishDriveMenuItem";

describe("TeamverPublishDriveMenuItem", () => {
  beforeEach(() => {
    cleanup();
    getWorkspaceMock.mockClear();
    listTargetsMock.mockClear();
    searchTargetsMock.mockClear();
    listImportScopesMock.mockClear();
    listImportRowsMock.mockClear();
    publishMock.mockClear();
  });

  it("browses searchable Drive targets and publishes to the selected team folder", async () => {
    const onCloseMenu = vi.fn();
    const onSuccess = vi.fn();

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={onCloseMenu}
        onSuccess={onSuccess}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalledWith("ws-1", { limit: 200 });
    });

    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    const modal = screen.getByTestId("teamver-drive-picker-modal");
    fireEvent.change(within(modal).getByRole("textbox", { name: "Search Drive folders" }), {
      target: { value: "exports" },
    });

    expect(within(modal).queryByText("My Drive")).toBeNull();
    fireEvent.click(screen.getByTestId("teamver-drive-picker-target-shared:SD-1:FLD-EXPORTS"));

    await waitFor(() => {
      expect(screen.queryByTestId("teamver-drive-picker-modal")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith({
        projectId: "od-1",
        artifactFile: "deck/index.html",
        formats: ["html", "zip"],
        folderId: "FLD-EXPORTS",
        sharedDriveId: "SD-1",
      });
    });
    expect(onCloseMenu).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ driveAssetId: "AST-1" }),
      { partial: false },
    );
  });

  it("publishes to a folder returned by server-side Drive search", async () => {
    const onCloseMenu = vi.fn();

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={onCloseMenu}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalledWith("ws-1", { limit: 200 });
    });

    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    const modal = screen.getByTestId("teamver-drive-picker-modal");
    fireEvent.change(within(modal).getByRole("textbox", { name: "Search Drive folders" }), {
      target: { value: "launch" },
    });

    await waitFor(() => {
      expect(searchTargetsMock).toHaveBeenCalledWith("ws-1", "launch", { limit: 80 });
      expect(within(modal).getByText("Marketing / Launch exports")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("teamver-drive-picker-target-shared:SD-2:FLD-REMOTE"));

    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith({
        projectId: "od-1",
        artifactFile: "deck/index.html",
        formats: ["html", "zip"],
        folderId: "FLD-REMOTE",
        sharedDriveId: "SD-2",
      });
    });
  });

  // loop 176 — deadlock-fix regressions
  it("keeps Browse + select usable when listTeamverDrivePublishTargets returns []", async () => {
    listTargetsMock.mockResolvedValueOnce([]);

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalledWith("ws-1", { limit: 200 });
    });

    const select = screen.getByTestId("teamver-drive-target-select");
    expect(select.hasAttribute("disabled")).toBe(false);
    const options = within(select as HTMLElement).getAllByRole("option");
    expect(options.map((opt) => (opt as HTMLOptionElement).value)).toContain("personal-default");
    expect(options.length).toBeGreaterThanOrEqual(1);
    const browseButton = screen.getByTestId("teamver-drive-target-browse");
    expect(browseButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));
    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: null,
          sharedDriveId: null,
        }),
      );
    });
  });

  it("surfaces a status hint and refetches when listTeamverDrivePublishTargets throws", async () => {
    listTargetsMock.mockRejectedValueOnce(new Error("network"));
    listTargetsMock.mockResolvedValueOnce([
      {
        id: "personal-root",
        label: "My Drive",
        description: "Personal drive root",
        folderId: "FLD-MY-ROOT",
        sharedDriveId: null,
      },
    ]);

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("teamver-drive-target-error")).toBeTruthy();
    });
    const browseButton = screen.getByTestId("teamver-drive-target-browse");
    expect(browseButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(browseButton);
    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalledTimes(2);
    });
  });

  it("treats a null workspace bridge as a soft pending state, not a deadlock", async () => {
    getWorkspaceMock.mockResolvedValueOnce("");

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("teamver-drive-target-error").textContent).toMatch(/연결 중/);
    });
    expect(listTargetsMock).not.toHaveBeenCalled();
    const select = screen.getByTestId("teamver-drive-target-select");
    expect(select.hasAttribute("disabled")).toBe(false);
    const browseButton = screen.getByTestId("teamver-drive-target-browse");
    expect(browseButton.hasAttribute("disabled")).toBe(false);
  });

  it("browses Drive folders and keeps the browsed folder as publish target", async () => {
    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalledWith("ws-1", { limit: 200 });
    });

    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    const modal = screen.getByTestId("teamver-drive-picker-modal");

    await waitFor(() => {
      expect(listImportScopesMock).toHaveBeenCalledWith("ws-1");
      expect(within(modal).getByText("Browse exports")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("teamver-drive-picker-target-personal:FLD-BROWSE"));

    await waitFor(() => {
      expect(screen.getByTestId("teamver-drive-picker-use-current").getAttribute("type")).toBe("button");
    });
    fireEvent.click(screen.getByTestId("teamver-drive-picker-use-current"));
    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: "FLD-BROWSE",
          sharedDriveId: null,
        }),
      );
    });
  });
});
