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
  getDesignBffClient: vi.fn(() => ({
    http: { post: postMock },
    workspaceStore: { get: getWorkspaceMock },
  })),
}));

import { publishTeamverDesignToDrive } from "../src/teamver/publishToDrive";

describe("publishTeamverDesignToDrive", () => {
  beforeEach(() => {
    postMock.mockReset();
    getWorkspaceMock.mockClear();
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
  });
});
