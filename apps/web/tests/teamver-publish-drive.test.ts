import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();
const getWorkspaceMock = vi.fn(async () => "ws-1");

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDesignApiBase: vi.fn(() => "https://stg-design-api.teamver.com"),
  resolveTeamverLoginUrl: vi.fn(() => "https://stg.teamver.com/auth/signin"),
  resolveTeamverMainOrigin: vi.fn(() => "https://stg.teamver.com"),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  fetchTeamverWorkspacePermissions: vi.fn(async () => null),
  getDesignBffClient: vi.fn(() => ({
    http: { post: postMock },
    workspaceStore: { get: getWorkspaceMock },
  })),
}));

const assertAppEnabledMock = vi.fn(async (_workspaceId: string) => undefined);

vi.mock("../src/teamver/teamverDesignAccess", () => ({
  assertTeamverDesignAppEnabled: (workspaceId: string) => assertAppEnabledMock(workspaceId),
}));

import { NetworkError } from "@teamver/app-sdk";
import {
  formatPublishErrorCodeForUser,
  formatPublishErrorMessage,
  formatTeamverDesignErrorMessage,
  parsePublishFailureFromError,
  publishTeamverDesignToDrive,
  resolvePublishErrorCode,
} from "../src/teamver/publishToDrive";

describe("publishTeamverDesignToDrive", () => {
  beforeEach(() => {
    postMock.mockReset();
    getWorkspaceMock.mockClear();
    assertAppEnabledMock.mockClear();
    delete process.env.VITE_TEAMVER_DRIVE_PUBLISH_FOLDER_ID;
    delete process.env.VITE_TEAMVER_DRIVE_PUBLISH_SHARED_DRIVE_ID;
  });

  it("checks appEnabled before publish", async () => {
    assertAppEnabledMock.mockRejectedValueOnce(new Error("app_disabled_globally"));
    await expect(
      publishTeamverDesignToDrive({ projectId: "od-1" }),
    ).rejects.toThrow("app_disabled_globally");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("posts publish with workspace header", async () => {
    postMock.mockResolvedValue({
      projectId: "DPRJ-1",
      outputs: [
        {
          id: "DOUT-1",
          kind: "html",
          driveAssetId: "AST-1",
          filename: "Landing.html",
          sizeBytes: 100,
          mimeType: "text/html",
        },
      ],
    });

    const result = await publishTeamverDesignToDrive({
      projectId: "od-1",
      artifactFile: "deck/index.html",
    });

    expect(postMock).toHaveBeenCalledWith(
      "/projects/od-1/publish",
      {
        formats: ["html"],
        artifactFile: "deck/index.html",
        folderId: null,
        sharedDriveId: null,
      },
      expect.objectContaining({ workspaceId: "ws-1", skipAuthHeader: true }),
    );
    expect(result.outputs[0]?.driveAssetId).toBe("AST-1");
    expect(result.partial).toBe(false);
  });

  it("posts publish with shared drive target", async () => {
    postMock.mockResolvedValue({
      projectId: "DPRJ-1",
      outputs: [
        {
          id: "DOUT-1",
          kind: "html",
          driveAssetId: "AST-1",
          driveFolderId: "FLD-TEAM",
          driveSharedDriveId: "SD-TEAM",
          filename: "Landing.html",
          sizeBytes: 100,
          mimeType: "text/html",
        },
      ],
    });

    const result = await publishTeamverDesignToDrive({
      projectId: "od-1",
      artifactFile: "deck/index.html",
      folderId: "FLD-TEAM",
      sharedDriveId: "SD-TEAM",
    });

    expect(postMock).toHaveBeenCalledWith(
      "/projects/od-1/publish",
      {
        formats: ["html"],
        artifactFile: "deck/index.html",
        folderId: "FLD-TEAM",
        sharedDriveId: "SD-TEAM",
      },
      expect.objectContaining({ workspaceId: "ws-1", skipAuthHeader: true }),
    );
    expect(result.outputs[0]?.driveFolderId).toBe("FLD-TEAM");
    expect(result.outputs[0]?.driveSharedDriveId).toBe("SD-TEAM");
  });

  it("uses default shared drive target from env", async () => {
    process.env.VITE_TEAMVER_DRIVE_PUBLISH_FOLDER_ID = "FLD-ENV";
    process.env.VITE_TEAMVER_DRIVE_PUBLISH_SHARED_DRIVE_ID = "SD-ENV";
    postMock.mockResolvedValue({
      projectId: "DPRJ-1",
      outputs: [
        {
          id: "DOUT-1",
          kind: "html",
          driveAssetId: "AST-ENV",
          filename: "Landing.html",
          sizeBytes: 100,
          mimeType: "text/html",
        },
      ],
    });

    await publishTeamverDesignToDrive({ projectId: "od-1" });

    expect(postMock).toHaveBeenCalledWith(
      "/projects/od-1/publish",
      expect.objectContaining({
        folderId: "FLD-ENV",
        sharedDriveId: "SD-ENV",
      }),
      expect.any(Object),
    );
  });

  it("returns ready outputs only on 207 partial", async () => {
    postMock.mockResolvedValue({
      projectId: "DPRJ-1",
      outputs: [
        {
          kind: "html",
          publishStatus: "failed",
          errorCode: "od_daemon_export_failed",
        },
        {
          id: "DOUT-2",
          kind: "zip",
          driveAssetId: "AST-2",
          filename: "Landing.zip",
          publishStatus: "ready",
          sizeBytes: 200,
          mimeType: "application/zip",
        },
      ],
    });

    const result = await publishTeamverDesignToDrive({
      projectId: "od-1",
      artifactFile: "deck/index.html",
      formats: ["html", "zip"],
    });

    expect(result.partial).toBe(true);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.driveAssetId).toBe("AST-2");
  });

  it("throws per-format error code from 502 response body", async () => {
    postMock.mockRejectedValue(
      new NetworkError({
        message: "publish failed",
        status: 502,
        responseBody: {
          projectId: "DPRJ-1",
          outputs: [
            {
              kind: "html",
              publishStatus: "failed",
              errorCode: "od_daemon_export_failed",
            },
          ],
        },
      }),
    );

    await expect(
      publishTeamverDesignToDrive({ projectId: "od-1", artifactFile: "index.html" }),
    ).rejects.toThrow("od_daemon_export_failed");
  });
});

describe("parsePublishFailureFromError", () => {
  it("extracts structured 502 publish payload", () => {
    const err = new NetworkError({
      message: "bad gateway",
      status: 502,
      responseBody: {
        projectId: "DPRJ-9",
        outputs: [{ kind: "zip", publishStatus: "failed", errorCode: "drive_upload_failed" }],
      },
    });
    const parsed = parsePublishFailureFromError(err);
    expect(parsed?.projectId).toBe("DPRJ-9");
    expect(resolvePublishErrorCode(parsed!)).toBe("drive_upload_failed");
  });
});

describe("formatPublishErrorCodeForUser", () => {
  it("maps loop-177 phase codes to Korean user hints (loop 173)", () => {
    expect(formatPublishErrorCodeForUser("drive_upload_failed_403")).toMatch(/세션이 만료/);
    expect(formatPublishErrorCodeForUser("drive_presigned_put_failed_502")).toMatch(/저장소 업로드/);
    expect(formatPublishErrorCodeForUser("drive.confirm_timeout")).toMatch(/완료하지 못/);
    expect(formatPublishErrorCodeForUser("artifact_file_required")).toMatch(/슬라이드 파일/);
  });

  it("falls back to raw code for unknown errors", () => {
    expect(formatPublishErrorCodeForUser("custom_operator_code")).toBe("custom_operator_code");
  });
});

describe("formatTeamverDesignErrorMessage", () => {
  it("maps 502 publish body codes to Korean user hints (loop 173)", () => {
    const err = new NetworkError({
      message: "bad gateway",
      status: 502,
      responseBody: {
        outputs: [{ publishStatus: "failed", errorCode: "drive_presigned_put_failed_502" }],
      },
    });
    expect(formatTeamverDesignErrorMessage(err)).toMatch(/저장소 업로드/);
  });

  it("uses custom fallback for generic errors", () => {
    expect(
      formatTeamverDesignErrorMessage(new Error("publish_failed"), "Try publish first."),
    ).toBe("Try publish first.");
  });
});

describe("formatPublishErrorMessage", () => {
  it("maps 502 publish body to user hint", () => {
    const err = new NetworkError({
      message: "bad gateway",
      status: 502,
      responseBody: {
        outputs: [{ publishStatus: "failed", errorCode: "od_daemon_export_failed" }],
      },
    });
    expect(formatPublishErrorMessage(err)).toMatch(/프로젝트를 내보낼 수 없습니다/);
  });

  it("falls back for generic errors (loop 173 — Korean default)", () => {
    expect(formatPublishErrorMessage(new Error("publish_failed"))).toBe(
      "세션을 확인하고 다시 시도하세요.",
    );
  });
});
