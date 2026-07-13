import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dict } from "../src/i18n/types";

const postMock = vi.fn();
const getWorkspaceMock = vi.fn(async () => "ws-1");

vi.mock("../src/teamver/designBffClient", () => ({
  TEAMVER_BFF_REQUEST_OPTIONS: {
    skipAuthHeader: true,
    skipAuthRecovery: true,
  },
  getDesignBffClient: vi.fn(() => ({
    http: { post: postMock },
    workspaceStore: { get: getWorkspaceMock },
  })),
}));

const assertAppEnabledMock = vi.fn(async (_workspaceId: string) => undefined);

vi.mock("../src/teamver/teamverDesignAccess", () => ({
  assertTeamverDesignAppEnabled: (workspaceId: string) => assertAppEnabledMock(workspaceId),
}));

import { importTeamverDriveAssets } from "../src/teamver/importDriveAssets";

describe("importTeamverDriveAssets", () => {
  beforeEach(() => {
    postMock.mockReset();
    getWorkspaceMock.mockClear();
    assertAppEnabledMock.mockClear();
  });

  it("checks appEnabled before importing Drive assets", async () => {
    assertAppEnabledMock.mockRejectedValueOnce(new Error("app_disabled_globally"));

    await expect(
      importTeamverDriveAssets("od-1", [{ assetId: "AST-1", filename: "logo.svg" }]),
    ).rejects.toThrow("app_disabled_globally");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("posts Drive import assets with workspace header", async () => {
    postMock.mockResolvedValue({
      projectId: "DPRJ-1",
      imported: [
        {
          assetId: "AST-1",
          path: "refs/logo.svg",
          name: "logo.svg",
          sizeBytes: 3,
          mimeType: "image/svg+xml",
        },
      ],
      failed: [],
    });

    const result = await importTeamverDriveAssets("od-1", [
      {
        assetId: "AST-1",
        destPath: "refs/logo.svg",
        mimeType: "image/svg+xml",
      },
    ]);

    expect(postMock).toHaveBeenCalledWith(
      "/projects/od-1/import-drive",
      {
        assets: [
          {
            assetId: "AST-1",
            destPath: "refs/logo.svg",
            mimeType: "image/svg+xml",
          },
        ],
      },
      expect.objectContaining({ workspaceId: "ws-1", skipAuthHeader: true }),
    );
    expect(result.imported[0]?.path).toBe("refs/logo.svg");
    expect(result.partial).toBe(false);
  });

  it("marks partial when design-api returns imported and failed assets", async () => {
    postMock.mockResolvedValue({
      imported: [
        {
          assetId: "AST-1",
          path: "refs/drive/logo.svg",
          name: "logo.svg",
          sizeBytes: 3,
          mimeType: "image/svg+xml",
        },
      ],
      failed: [{ assetId: "AST-2", errorCode: "drive_download_failed" }],
    });

    const result = await importTeamverDriveAssets("od-1", [
      { assetId: "AST-1", filename: "logo.svg" },
      { assetId: "AST-2", filename: "missing.svg" },
    ]);

    expect(result.projectId).toBe("od-1");
    expect(result.partial).toBe(true);
    expect(result.failed[0]?.errorCode).toBe("drive_download_failed");
  });

  it("rejects empty import batches before calling design-api", async () => {
    await expect(importTeamverDriveAssets("od-1", [])).rejects.toThrow(
      "drive_import_assets_required",
    );
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe("formatDriveImportErrorCode", () => {
  it("maps known error codes and falls back to the raw code", async () => {
    const { formatDriveImportErrorCode } = await import("../src/teamver/importDriveAssets");
    const t = (key: keyof Dict) =>
      key === "teamver.driveImport.error.unsupported_drive_import_file_type"
        ? "Unsupported type"
        : String(key);

    expect(formatDriveImportErrorCode("unsupported_drive_import_file_type", t)).toBe(
      "Unsupported type",
    );
    expect(formatDriveImportErrorCode("unknown_code", t)).toBe("unknown_code");
  });
});

describe("formatDriveImportErrorForUser", () => {
  it("maps embed Drive import error codes to Korean user messages", async () => {
    const {
      formatDriveImportErrorForUser,
      formatTeamverDriveImportErrorMessage,
    } = await import("../src/teamver/importDriveAssets");

    expect(formatDriveImportErrorForUser("teamver_workspace_required")).toContain(
      "작업공간",
    );
    expect(formatDriveImportErrorForUser("drive_import_failed")).toContain(
      "Drive 가져오기",
    );
    expect(formatTeamverDriveImportErrorMessage(new Error("drive_download_failed"))).toContain(
      "다운로드",
    );
    expect(formatDriveImportErrorForUser("teamver_drive_fetch_failed:401")).toMatch(/세션/);
    expect(formatDriveImportErrorForUser("teamver_drive_fetch_failed:500")).toMatch(
      /목록을 불러오지/,
    );
  });
});
