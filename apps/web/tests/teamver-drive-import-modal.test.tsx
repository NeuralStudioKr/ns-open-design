// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { TeamverDriveImportModal } from "../src/teamver/components/TeamverDriveImportModal";
import { resetTeamverDriveBrowsePageCachesForTests } from "../src/teamver/driveBrowsePageCache";

const listScopesMock = vi.fn();
const browsePageMock = vi.fn();
const listRecentMock = vi.fn();
const searchRowsMock = vi.fn();
const fetchThumbnailsMock = vi.fn();

vi.mock("../src/teamver/driveImportList", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/driveImportList")>();
  return {
    ...actual,
    listTeamverDriveImportScopes: (...args: unknown[]) => listScopesMock(...args),
    browseTeamverDriveImportPage: (...args: unknown[]) => browsePageMock(...args),
    listTeamverDriveImportRecent: (...args: unknown[]) => listRecentMock(...args),
    searchTeamverDriveImportRows: (...args: unknown[]) => searchRowsMock(...args),
  };
});

vi.mock("../src/teamver/driveImportThumbnails", () => ({
  fetchTeamverDriveImportThumbnails: (...args: unknown[]) => fetchThumbnailsMock(...args),
}));

const useTeamverBrandingMock = vi.fn(() => ({ slideOnlyMvp: false }));
vi.mock("../src/teamver/branding/TeamverBrandingProvider", () => ({
  useTeamverBranding: () => useTeamverBrandingMock(),
}));

const trackMock = vi.fn();
vi.mock("../src/analytics/provider", () => ({
  useAnalytics: () => ({ track: trackMock }),
}));

describe("TeamverDriveImportModal", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    resetTeamverDriveBrowsePageCachesForTests();
    listScopesMock.mockReset();
    browsePageMock.mockReset();
    listRecentMock.mockReset();
    searchRowsMock.mockReset();
    fetchThumbnailsMock.mockReset();
    trackMock.mockReset();
    useTeamverBrandingMock.mockReturnValue({ slideOnlyMvp: false });
    listScopesMock.mockResolvedValue([
      { mode: "personal", folderId: "ROOT-PERSONAL", label: "내 드라이브" },
    ]);
    browsePageMock.mockResolvedValue({
      rows: [
        { kind: "asset", assetId: "AST-1", name: "logo.svg", mimeType: "image/svg+xml" },
        { kind: "folder", folderId: "FLD-1", name: "Assets" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    listRecentMock.mockResolvedValue([
      { kind: "asset", assetId: "AST-RECENT", name: "brand.png", mimeType: "image/png" },
    ]);
    searchRowsMock.mockResolvedValue([
      { kind: "asset", assetId: "AST-SEARCH", name: "deck.pptx", mimeType: "application/vnd.ms-powerpoint" },
    ]);
    fetchThumbnailsMock.mockResolvedValue(new Map());
  });

  it("renders assets and confirms selection", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    expect(await screen.findByTestId("teamver-drive-import-modal")).toBeTruthy();
    expect(await screen.findByTestId("teamver-drive-import-asset-AST-1")).toBeTruthy();
    expect(document.querySelector(".teamver-drive-import-grid")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("teamver-drive-import-asset-AST-1"));
    fireEvent.click(screen.getByTestId("teamver-drive-import-attach"));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith([
        expect.objectContaining({ assetId: "AST-1", filename: "logo.svg" }),
      ]);
      expect(trackMock).toHaveBeenCalledWith(
        "surface_view",
        expect.objectContaining({ area: "drive_import_modal", page_name: "chat_panel" }),
        undefined,
      );
      expect(trackMock).toHaveBeenCalledWith(
        "ui_click",
        expect.objectContaining({
          area: "drive_import_modal",
          element: "drive_import_pick",
          asset_count: 1,
        }),
        undefined,
      );
    });
  });

  it("shows recent section at drive root", async () => {
    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    expect(await screen.findByTestId("teamver-drive-import-recent")).toBeTruthy();
    expect(await screen.findByTestId("teamver-drive-import-asset-AST-RECENT")).toBeTruthy();
    expect(listRecentMock).toHaveBeenCalledWith({ workspaceId: "ws-1", limit: 16 });
  });

  it("navigates into folders with breadcrumb labels", async () => {
    browsePageMock
      .mockResolvedValueOnce({
        rows: [{ kind: "folder", folderId: "FLD-1", name: "Assets" }],
        hasMore: false,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        rows: [{ kind: "asset", assetId: "AST-INNER", name: "inner.csv", mimeType: "text/csv" }],
        hasMore: false,
        nextCursor: null,
      });

    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    fireEvent.click(await screen.findByTestId("teamver-drive-import-folder-FLD-1"));

    await waitFor(() => {
      expect(screen.getByText("Assets")).toBeTruthy();
      expect(screen.getByTestId("teamver-drive-import-asset-AST-INNER")).toBeTruthy();
    });
  });

  it("uses server search after explicit submit", async () => {
    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    await screen.findByTestId("teamver-drive-import-modal");
    const searchInput = screen.getByLabelText("드라이브 파일 검색");
    fireEvent.change(searchInput, {
      target: { value: "deck" },
    });
    expect(searchRowsMock).not.toHaveBeenCalled();

    fireEvent.keyDown(searchInput, { key: "Enter" });

    await waitFor(() => {
      expect(searchRowsMock).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws-1", query: "deck" }),
      );
      expect(screen.getByTestId("teamver-drive-import-asset-AST-SEARCH")).toBeTruthy();
    });
  });

  it("loads image thumbnails for grid cards", async () => {
    browsePageMock.mockResolvedValue({
      rows: [{ kind: "asset", assetId: "AST-IMG", name: "logo.png", mimeType: "image/png" }],
      hasMore: false,
      nextCursor: null,
    });
    fetchThumbnailsMock.mockResolvedValue(new Map([["AST-IMG", "https://cdn.example/logo.png"]]));

    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    await screen.findByTestId("teamver-drive-import-asset-AST-IMG");
    await waitFor(() => {
      expect(fetchThumbnailsMock).toHaveBeenCalled();
      const img = document.querySelector(
        '[data-testid="teamver-drive-import-asset-AST-IMG"] img',
      ) as HTMLImageElement | null;
      expect(img?.src).toContain("https://cdn.example/logo.png");
    });
  });

  it("double-click confirms immediately", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    const card = await screen.findByTestId("teamver-drive-import-asset-AST-1");
    fireEvent.doubleClick(card);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith([
        expect.objectContaining({ assetId: "AST-1", filename: "logo.svg" }),
      ]);
    });
  });

  it("selects recent assets on mousedown before search blur collapses the strip", async () => {
    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    await screen.findByTestId("teamver-drive-import-recent");
    const recentCard = await screen.findByTestId("teamver-drive-import-asset-AST-RECENT");
    fireEvent.mouseDown(recentCard);
    fireEvent.blur(screen.getByLabelText("드라이브 파일 검색"));

    expect(await screen.findByTestId("teamver-drive-import-selected")).toBeTruthy();
    expect((screen.getByTestId("teamver-drive-import-attach") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows blocked hint when unsupported file is clicked", async () => {
    useTeamverBrandingMock.mockReturnValue({ slideOnlyMvp: true });
    browsePageMock.mockResolvedValue({
      rows: [{ kind: "asset", assetId: "AST-VIDEO", name: "clip.mp4", mimeType: "video/mp4" }],
      hasMore: false,
      nextCursor: null,
    });
    listRecentMock.mockResolvedValue([]);

    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    fireEvent.mouseDown(await screen.findByTestId("teamver-drive-import-asset-AST-VIDEO"));
    expect(await screen.findByTestId("teamver-drive-import-action-hint")).toBeTruthy();
  });

  it("shows partial failures with retry and done actions", async () => {
    const onRetryFailed = vi.fn();
    const onDismissPartial = vi.fn();
    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
        partialResult={{
          importedCount: 1,
          failures: [
            {
              asset: { assetId: "AST-2", filename: "clip.mp4" },
              errorCode: "unsupported_drive_import_file_type",
            },
          ],
        }}
        onRetryFailed={onRetryFailed}
        onDismissPartial={onDismissPartial}
      />,
    );

    expect(await screen.findByTestId("teamver-drive-import-partial")).toBeTruthy();
    expect(screen.getByText("clip.mp4")).toBeTruthy();
    expect(screen.getByText("슬라이드 첨부에 지원하지 않는 파일 형식입니다.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("teamver-drive-import-retry"));
    expect(onRetryFailed).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("teamver-drive-import-done"));
    expect(onDismissPartial).toHaveBeenCalledTimes(1);
  });

  it("filters recent rows by active shared-drive scope", async () => {
    listScopesMock.mockResolvedValue([
      { mode: "personal", folderId: "ROOT-PERSONAL", label: "내 드라이브" },
      { mode: "shared", sharedDriveId: "SD-1", folderId: "ROOT-SD-1", label: "개발팀" },
    ]);
    listRecentMock.mockResolvedValue([
      { kind: "asset", assetId: "AST-PERSONAL", name: "mine.png", mimeType: "image/png", sharedDriveId: null },
    ]);
    browsePageMock.mockResolvedValue({ rows: [], hasMore: false, nextCursor: null });

    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    expect(await screen.findByTestId("teamver-drive-import-asset-AST-PERSONAL")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "개발팀" }));

    await waitFor(() => {
      expect(screen.queryByTestId("teamver-drive-import-recent")).toBeNull();
    });
  });

  it("renders into document.body and locks background scroll while open", async () => {
    const host = document.createElement("div");
    host.className = "entry-main--scroll";
    host.style.overflow = "auto";
    document.body.appendChild(host);
    try {
      const { unmount } = render(
        <TeamverDriveImportModal
          open
          workspaceId="ws-1"
          onClose={() => undefined}
          onConfirm={async () => undefined}
        />,
        { container: host },
      );

      const modal = await screen.findByTestId("teamver-drive-import-modal");
      // Portal target is <body>, not the test host container.
      expect(host.contains(modal)).toBe(false);
      expect(document.body.contains(modal)).toBe(true);
      // Background containers must be locked so the hero/recent strips don't
      // scroll under the open modal.
      expect(document.body.style.overflow).toBe("hidden");
      expect(host.style.overflow).toBe("hidden");

      unmount();
      // Both overflows must be restored on unmount so a subsequent close
      // doesn't trap the page in a frozen state.
      expect(document.body.style.overflow).toBe("");
      expect(host.style.overflow).toBe("auto");
    } finally {
      document.body.removeChild(host);
    }
  });

  it("does not close when a drag starts inside the list and ends on the backdrop", async () => {
    const onClose = vi.fn();
    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={onClose}
        onConfirm={async () => undefined}
      />,
    );

    const modal = await screen.findByTestId("teamver-drive-import-modal");
    const backdrop = modal.parentElement as HTMLElement;
    expect(backdrop.className).toContain("teamver-drive-picker-backdrop");

    // mousedown inside modal, mouseup on backdrop — must NOT dismiss.
    fireEvent.mouseDown(modal);
    fireEvent.mouseUp(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    // mousedown + mouseup on backdrop — dismisses.
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("loads more browse rows with cursor pagination", async () => {
    browsePageMock
      .mockResolvedValueOnce({
        rows: Array.from({ length: 24 }, (_, index) => ({
          kind: "asset" as const,
          assetId: `AST-${index + 1}`,
          name: `file-${index + 1}.png`,
          mimeType: "image/png",
        })),
        hasMore: true,
        nextCursor: "cursor-page-2",
      })
      .mockResolvedValueOnce({
        rows: [
          {
            kind: "asset" as const,
            assetId: "AST-25",
            name: "file-25.png",
            mimeType: "image/png",
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    await screen.findByTestId("teamver-drive-import-asset-AST-1");
    expect(browsePageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        limit: 24,
        before: null,
      }),
    );
    fireEvent.click(screen.getByTestId("teamver-drive-import-load-more"));
    await waitFor(() => {
      expect(browsePageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          before: "cursor-page-2",
        }),
      );
      expect(screen.getByTestId("teamver-drive-import-asset-AST-25")).toBeTruthy();
    });
  });
});
