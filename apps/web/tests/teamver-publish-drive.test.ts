import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();
const getWorkspaceMock = vi.fn(async () => "ws-1");

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDesignApiBase: vi.fn(() => "https://stg-design-api.teamver.com"),
  resolveTeamverLoginUrl: vi.fn(() => "https://stg.teamver.com/auth/login"),
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
  });

  it("checks app_enabled before publish", async () => {
    assertAppEnabledMock.mockRejectedValueOnce(new Error("app_disabled_globally"));
    await expect(
      publishTeamverDesignToDrive({ projectId: "od-1" }),
    ).rejects.toThrow("app_disabled_globally");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("posts publish with workspace header", async () => {
    postMock.mockResolvedValue({
      project_id: "DPRJ-1",
      outputs: [
        {
          id: "DOUT-1",
          kind: "html",
          drive_asset_id: "AST-1",
          filename: "Landing.html",
          size_bytes: 100,
          mime_type: "text/html",
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
      },
      expect.objectContaining({ workspaceId: "ws-1", skipAuthHeader: true }),
    );
    expect(result.outputs[0]?.driveAssetId).toBe("AST-1");
    expect(result.partial).toBe(false);
  });

  it("returns ready outputs only on 207 partial", async () => {
    postMock.mockResolvedValue({
      project_id: "DPRJ-1",
      outputs: [
        {
          kind: "html",
          publish_status: "failed",
          error_code: "od_daemon_export_failed",
        },
        {
          id: "DOUT-2",
          kind: "zip",
          drive_asset_id: "AST-2",
          filename: "Landing.zip",
          publish_status: "ready",
          size_bytes: 200,
          mime_type: "application/zip",
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
        outputs: [{ kind: "zip", publish_status: "failed", error_code: "drive_upload_failed" }],
      },
    });
    const parsed = parsePublishFailureFromError(err);
    expect(parsed?.projectId).toBe("DPRJ-9");
    expect(resolvePublishErrorCode(parsed!)).toBe("drive_upload_failed");
  });
});

describe("formatTeamverDesignErrorMessage", () => {
  it("uses custom fallback for generic errors", () => {
    expect(
      formatTeamverDesignErrorMessage(new Error("publish_failed"), "Try publish first."),
    ).toBe("Try publish first.");
  });
});

describe("formatPublishErrorMessage", () => {
  it("maps 502 publish body to error code", () => {
    const err = new NetworkError({
      message: "bad gateway",
      status: 502,
      responseBody: {
        outputs: [{ publish_status: "failed", error_code: "od_daemon_export_failed" }],
      },
    });
    expect(formatPublishErrorMessage(err)).toBe("od_daemon_export_failed");
  });

  it("falls back for generic errors", () => {
    expect(formatPublishErrorMessage(new Error("publish_failed"))).toBe(
      "Check your session and try again.",
    );
  });
});
