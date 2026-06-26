// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const getWorkspaceMock = vi.fn(async () => "ws-1");
const listTargetsMock = vi.fn(async (_workspaceId: string, _options?: { limit?: number }) => [
  {
    id: "personal-root",
    label: "내 드라이브",
    description: "개인 드라이브 루트",
    folderId: "FLD-MY-ROOT",
    sharedDriveId: null,
  },
  {
    id: "shared:SD-1:FLD-EXPORTS",
    label: "Product / Exports",
    description: "팀 드라이브 폴더",
    folderId: "FLD-EXPORTS",
    sharedDriveId: "SD-1",
  },
]);
const searchTargetsMock = vi.fn(async (_workspaceId: string, _query: string, _options?: { limit?: number }) => [
  {
    id: "shared:SD-2:FLD-REMOTE",
    label: "Marketing / Launch exports",
    description: "팀 드라이브 폴더 검색 결과",
    folderId: "FLD-REMOTE",
    sharedDriveId: "SD-2",
  },
]);
const listImportScopesMock = vi.fn(async (_workspaceId: string) => [
  { mode: "personal" as const, folderId: null, label: "내 드라이브" },
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
      publishedAt: "2026-06-22T10:00:00Z",
      sizeBytes: 12345,
      mimeType: "text/html",
    },
  ],
}));
const listOutputsMock = vi.fn(async (_projectId: string) => ({
  projectId: "DPRJ-1",
  outputs: [] as Array<Record<string, unknown>>,
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDriveAssetUrl: vi.fn((id: string) => `https://stg.teamver.com/drive?asset=${id}`),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    workspaceStore: { get: getWorkspaceMock },
  })),
}));

vi.mock("../src/teamver/activeTeamverWorkspace", () => ({
  readActiveTeamverWorkspaceId: () => getWorkspaceMock(),
  resolveActiveTeamverWorkspaceIdForEmbed: () => getWorkspaceMock(),
  requireActiveTeamverWorkspaceId: async () => {
    const id = await getWorkspaceMock();
    if (!id) throw new Error("teamver_workspace_required");
    return id;
  },
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

vi.mock("../src/teamver/publishToDrive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/publishToDrive")>();
  return {
    ...actual,
    formatPublishErrorCodeForUser: actual.formatPublishErrorCodeForUser,
    publishTeamverDesignToDrive: (args: unknown) => publishMock(args),
    pickReadyPublishOutputs: (outputs: Array<{ publishStatus?: string }>) =>
      outputs.filter((output) => output.publishStatus === "ready"),
  };
});

vi.mock("../src/teamver/listProjectOutputs", () => ({
  listTeamverProjectOutputs: (projectId: string) => listOutputsMock(projectId),
}));

import { TeamverPublishDriveMenuItem } from "../src/teamver/components/TeamverPublishDriveMenuItem";

const browseButtonOptions = { name: "찾아보기" } as const;
const LOCAL_STORAGE_LAST_TARGET_KEY = "teamver.drive.lastPublishTarget.ws-1.od-1";

describe("TeamverPublishDriveMenuItem", () => {
  beforeEach(() => {
    cleanup();
    getWorkspaceMock.mockClear();
    listTargetsMock.mockClear();
    searchTargetsMock.mockClear();
    listImportScopesMock.mockClear();
    listImportRowsMock.mockClear();
    publishMock.mockClear();
    listOutputsMock.mockClear();
    listOutputsMock.mockResolvedValue({ projectId: "DPRJ-1", outputs: [] });
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom localStorage is always present */
    }
  });

  afterEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* noop */
    }
  });

  it("browses searchable Drive targets and publishes HTML to the selected team folder", async () => {
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

    fireEvent.click(screen.getByRole("button", browseButtonOptions));
    const modal = screen.getByTestId("teamver-drive-picker-modal");
    fireEvent.change(within(modal).getByRole("textbox", { name: "드라이브 폴더 검색" }), {
      target: { value: "exports" },
    });

    expect(within(modal).queryByText("내 드라이브")).toBeNull();
    fireEvent.click(screen.getByTestId("teamver-drive-picker-target-shared:SD-1:FLD-EXPORTS"));

    await waitFor(() => {
      expect(screen.queryByTestId("teamver-drive-picker-modal")).toBeNull();
    });

    // loop 174 — Drive publish is now HTML-only (ZIP dropped from the UI;
    // PDF deferred to a BE-rendered track).
    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith({
        projectId: "od-1",
        artifactFile: "deck/index.html",
        formats: ["html"],
        folderId: "FLD-EXPORTS",
        sharedDriveId: "SD-1",
      });
    });
    expect(onCloseMenu).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ driveAssetId: "AST-1" }),
      { partial: false },
    );
    // loop 174 — successful publish persists the chosen target so subsequent
    // publishes default to the same folder.
    await waitFor(() => {
      expect(window.localStorage.getItem(LOCAL_STORAGE_LAST_TARGET_KEY)).toBe(
        "shared:SD-1:FLD-EXPORTS",
      );
    });
  });

  it("publishes to a folder returned by server-side Drive search", async () => {
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

    fireEvent.click(screen.getByRole("button", browseButtonOptions));
    const modal = screen.getByTestId("teamver-drive-picker-modal");
    fireEvent.change(within(modal).getByRole("textbox", { name: "드라이브 폴더 검색" }), {
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
        formats: ["html"],
        folderId: "FLD-REMOTE",
        sharedDriveId: "SD-2",
      });
    });
  });

  // loop 174 — Custom listbox replaces the native <select>
  it("uses a custom listbox (button + popover) to pick the destination", async () => {
    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalled();
    });

    const trigger = screen.getByTestId("teamver-drive-target-select");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const popover = await screen.findByTestId("teamver-drive-target-popover");
    expect(popover.getAttribute("role")).toBe("listbox");

    fireEvent.click(within(popover).getByTestId("teamver-drive-target-option-shared:SD-1:FLD-EXPORTS"));

    await waitFor(() => {
      expect(screen.queryByTestId("teamver-drive-target-popover")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));
    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: "FLD-EXPORTS",
          sharedDriveId: "SD-1",
        }),
      );
    });
  });

  // loop 174 — Drive publish history surface
  it("shows the publish history with version labels and Drive deep links", async () => {
    listOutputsMock.mockResolvedValueOnce({
      projectId: "DPRJ-1",
      outputs: [
        {
          id: "OUT-3",
          kind: "html",
          driveAssetId: "AST-3",
          driveFolderId: null,
          driveSharedDriveId: null,
          filename: "Deck.html",
          sizeBytes: 23000,
          mimeType: "text/html",
          publishStatus: "ready",
          publishedAt: "2026-06-22T01:00:00Z",
        },
        {
          id: "OUT-2",
          kind: "html",
          driveAssetId: "AST-2",
          driveFolderId: null,
          driveSharedDriveId: null,
          filename: "Deck.html",
          sizeBytes: 22000,
          mimeType: "text/html",
          publishStatus: "ready",
          publishedAt: "2026-06-21T01:00:00Z",
        },
      ],
    });

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listOutputsMock).toHaveBeenCalledWith("od-1");
    });

    // The newest publish must carry the highest version number.
    const row0 = await screen.findByTestId("teamver-drive-history-row-0");
    expect(within(row0).getByTestId("teamver-drive-history-version-0").textContent).toBe("v2");
    const row1 = screen.getByTestId("teamver-drive-history-row-1");
    expect(within(row1).getByTestId("teamver-drive-history-version-1").textContent).toBe("v1");
    expect(
      (screen.getByTestId("teamver-drive-history-open-0") as HTMLAnchorElement).href,
    ).toContain("AST-3");
  });

  it("shows the empty-state hint when the project has no Drive publishes yet", async () => {
    listOutputsMock.mockResolvedValueOnce({ projectId: "DPRJ-1", outputs: [] });
    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listOutputsMock).toHaveBeenCalled();
    });

    expect(
      screen.getByTestId("teamver-drive-history-empty").textContent,
    ).toContain("아직 Teamver 드라이브에 발행한 적이 없습니다");
  });

  it("refetches the history right after a successful publish", async () => {
    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listOutputsMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalled();
      expect(listOutputsMock).toHaveBeenCalledTimes(2);
    });
  });

  // loop 174 — last-publish-target persistence
  it("restores the operator's last publish target on next mount", async () => {
    window.localStorage.setItem(LOCAL_STORAGE_LAST_TARGET_KEY, "shared:SD-1:FLD-EXPORTS");

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));
    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: "FLD-EXPORTS",
          sharedDriveId: "SD-1",
        }),
      );
    });
  });

  it("focuses and opens the destination picker when opened from post-run menu entry", async () => {
    window.localStorage.setItem(LOCAL_STORAGE_LAST_TARGET_KEY, "shared:SD-1:FLD-EXPORTS");

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        focusTargetSelectNonce={42}
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalled();
    });

    const trigger = screen.getByTestId("teamver-drive-target-select");
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    });
    expect(screen.getByTestId("teamver-drive-target-popover")).toBeTruthy();
    expect(screen.getByTestId("teamver-drive-post-run-hint").textContent).toContain(
      "Product / Exports",
    );
  });

  it("restores a browse-only remembered target from recent targets cache", async () => {
    const deepTarget = {
      id: "shared:SD-9:FLD-DEEP",
      label: "Archive / Deep exports",
      description: "팀 드라이브 폴더",
      folderId: "FLD-DEEP",
      sharedDriveId: "SD-9",
    };
    window.localStorage.setItem(LOCAL_STORAGE_LAST_TARGET_KEY, deepTarget.id);
    window.localStorage.setItem(
      "teamver.drive.recentPublishTargets.ws-1",
      JSON.stringify([deepTarget]),
    );

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));
    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: "FLD-DEEP",
          sharedDriveId: "SD-9",
        }),
      );
    });
  });

  it("surfaces a browse hint when the remembered target is missing after post-run entry", async () => {
    window.localStorage.setItem(LOCAL_STORAGE_LAST_TARGET_KEY, "gone:ABC");

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        focusTargetSelectNonce={7}
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalled();
    });

    expect(screen.getByTestId("teamver-drive-post-run-hint").textContent).toContain("찾아보기");
  });

  it("falls back to the default destination when the remembered target no longer exists", async () => {
    window.localStorage.setItem(LOCAL_STORAGE_LAST_TARGET_KEY, "gone:ABC");

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("teamver-publish-drive-menu-item"));
    // The mocked listTargets payload doesn't include a (null folder, null
    // shared drive) row, so `ensureDefaultTarget` prepends the
    // `personal-default` fallback and `selectedTarget` resolves to that row
    // when the remembered id can't be matched against the current list.
    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: null,
          sharedDriveId: null,
        }),
      );
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

    const trigger = screen.getByTestId("teamver-drive-target-select");
    expect(trigger.hasAttribute("disabled")).toBe(false);

    fireEvent.click(trigger);
    const popover = await screen.findByTestId("teamver-drive-target-popover");
    const options = within(popover).getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(
      options.some((opt) => opt.getAttribute("data-testid") === "teamver-drive-target-option-personal-default"),
    ).toBe(true);

    // Close popover by re-clicking the trigger to keep the next assertions
    // focused on the publish button rather than popover lifecycle.
    fireEvent.click(trigger);

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
        label: "내 드라이브",
        description: "개인 드라이브 루트",
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
    getWorkspaceMock.mockResolvedValueOnce(null);

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
    const trigger = screen.getByTestId("teamver-drive-target-select");
    expect(trigger.hasAttribute("disabled")).toBe(false);
    const browseButton = screen.getByTestId("teamver-drive-target-browse");
    expect(browseButton.hasAttribute("disabled")).toBe(false);
  });

  // loop 335 — workspace switch must drop the previous tenant's target cache
  // and selection. Without this fix the menu reuses ws-1's `selectedTargetId`
  // (potentially backed by a stale `folderId`/`sharedDriveId`) when publishing
  // from ws-2 and the artifact lands in the wrong tenant.
  it("refetches publish targets and resets selection on workspace switch", async () => {
    const { dispatchTeamverWorkspaceChanged } = await import(
      "../src/teamver/teamverWorkspaceEvents"
    );

    render(
      <TeamverPublishDriveMenuItem
        projectId="od-1"
        artifactFile="deck/index.html"
        onCloseMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalledTimes(1);
      expect(listTargetsMock).toHaveBeenCalledWith("ws-1", { limit: 200 });
    });

    const trigger = screen.getByTestId("teamver-drive-target-select");
    fireEvent.click(trigger);
    const popover = await screen.findByTestId("teamver-drive-target-popover");
    fireEvent.click(
      within(popover).getByTestId("teamver-drive-target-option-shared:SD-1:FLD-EXPORTS"),
    );

    getWorkspaceMock.mockResolvedValueOnce("ws-2");
    listTargetsMock.mockResolvedValueOnce([
      {
        id: "personal-root",
        label: "내 드라이브",
        description: "개인 드라이브 루트",
        folderId: "FLD-WS2-ROOT",
        sharedDriveId: null,
      },
    ]);
    dispatchTeamverWorkspaceChanged("ws-2");

    await waitFor(() => {
      expect(listTargetsMock).toHaveBeenCalledWith("ws-2", { limit: 200 });
    });

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

  it("closes the publish picker modal on workspace switch", async () => {
    const { dispatchTeamverWorkspaceChanged } = await import(
      "../src/teamver/teamverWorkspaceEvents"
    );

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

    fireEvent.click(screen.getByRole("button", browseButtonOptions));
    expect(screen.getByTestId("teamver-drive-picker-modal")).toBeTruthy();

    getWorkspaceMock.mockResolvedValueOnce("ws-2");
    listTargetsMock.mockResolvedValueOnce([
      {
        id: "personal-root",
        label: "내 드라이브",
        description: "개인 드라이브 루트",
        folderId: "FLD-WS2-ROOT",
        sharedDriveId: null,
      },
    ]);
    dispatchTeamverWorkspaceChanged("ws-2");

    await waitFor(() => {
      expect(screen.queryByTestId("teamver-drive-picker-modal")).toBeNull();
    });
  });

  // loop 378 — publish picker must escape the share-menu stacking context so
  // it doesn't get clipped under Home recents / project preview cards, and
  // must lock the background scroll while open so the operator's wheel
  // events don't leak through to the host page.
  it("portals the publish picker to <body> and locks background scroll while open", async () => {
    const host = document.createElement("div");
    host.className = "entry-main--scroll";
    host.style.overflow = "auto";
    document.body.appendChild(host);
    try {
      render(
        <TeamverPublishDriveMenuItem
          projectId="od-1"
          artifactFile="deck/index.html"
          onCloseMenu={vi.fn()}
        />,
        { container: host },
      );

      await waitFor(() => {
        expect(listTargetsMock).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole("button", browseButtonOptions));
      const modal = await screen.findByTestId("teamver-drive-picker-modal");
      expect(host.contains(modal)).toBe(false);
      expect(document.body.contains(modal)).toBe(true);
      expect(document.body.style.overflow).toBe("hidden");
      expect(host.style.overflow).toBe("hidden");
    } finally {
      document.body.removeChild(host);
    }
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

    fireEvent.click(screen.getByRole("button", browseButtonOptions));
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
