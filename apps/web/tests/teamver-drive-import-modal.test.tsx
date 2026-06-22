// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { TeamverDriveImportModal } from "../src/teamver/components/TeamverDriveImportModal";

const listScopesMock = vi.fn();
const listRowsMock = vi.fn();
const listRecentMock = vi.fn();
const searchRowsMock = vi.fn();
const fetchThumbnailsMock = vi.fn();

vi.mock("../src/teamver/driveImportList", () => ({
  listTeamverDriveImportScopes: (...args: unknown[]) => listScopesMock(...args),
  listTeamverDriveImportRows: (...args: unknown[]) => listRowsMock(...args),
  listTeamverDriveImportRecent: (...args: unknown[]) => listRecentMock(...args),
  searchTeamverDriveImportRows: (...args: unknown[]) => searchRowsMock(...args),
  TEAMVER_DRIVE_IMPORT_SEARCH_MIN: 2,
}));

vi.mock("../src/teamver/driveImportThumbnails", () => ({
  fetchTeamverDriveImportThumbnails: (...args: unknown[]) => fetchThumbnailsMock(...args),
}));

vi.mock("../src/teamver/branding/TeamverBrandingProvider", () => ({
  useTeamverBranding: () => ({ slideOnlyMvp: false }),
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
    listScopesMock.mockReset();
    listRowsMock.mockReset();
    listRecentMock.mockReset();
    searchRowsMock.mockReset();
    fetchThumbnailsMock.mockReset();
    trackMock.mockReset();
    listScopesMock.mockResolvedValue([{ mode: "personal", folderId: null, label: "My Drive" }]);
    listRowsMock.mockResolvedValue([
      { kind: "asset", assetId: "AST-1", name: "logo.svg", mimeType: "image/svg+xml" },
      { kind: "folder", folderId: "FLD-1", name: "Assets" },
    ]);
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
    fireEvent.click(screen.getByTestId("teamver-drive-import-asset-AST-1"));
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
    listRowsMock
      .mockResolvedValueOnce([
        { kind: "folder", folderId: "FLD-1", name: "Assets" },
      ])
      .mockResolvedValueOnce([
        { kind: "asset", assetId: "AST-INNER", name: "inner.csv", mimeType: "text/csv" },
      ]);

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

  it("uses server search after debounce", async () => {
    render(
      <TeamverDriveImportModal
        open
        workspaceId="ws-1"
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    await screen.findByTestId("teamver-drive-import-modal");
    fireEvent.change(screen.getByLabelText("Search Drive files"), {
      target: { value: "deck" },
    });

    await waitFor(
      () => {
        expect(searchRowsMock).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceId: "ws-1", query: "deck" }),
        );
        expect(screen.getByTestId("teamver-drive-import-asset-AST-SEARCH")).toBeTruthy();
      },
      { timeout: 800 },
    );
  });

  it("loads image thumbnails for grid cards", async () => {
    listRowsMock.mockResolvedValue([
      { kind: "asset", assetId: "AST-IMG", name: "logo.png", mimeType: "image/png" },
    ]);
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
    fireEvent.click(screen.getByTestId("teamver-drive-import-retry"));
    expect(onRetryFailed).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("teamver-drive-import-done"));
    expect(onDismissPartial).toHaveBeenCalledTimes(1);
  });
});
