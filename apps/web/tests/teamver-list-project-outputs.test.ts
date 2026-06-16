import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const getWorkspaceMock = vi.fn(async () => "ws-1");

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    http: { get: getMock },
    workspaceStore: { get: getWorkspaceMock },
  })),
}));

import {
  findLatestReadyPublishOutput,
  listTeamverProjectOutputs,
} from "../src/teamver/listProjectOutputs";

describe("listTeamverProjectOutputs", () => {
  beforeEach(() => {
    getMock.mockReset();
    getWorkspaceMock.mockClear();
  });

  it("fetches outputs with workspace header", async () => {
    getMock.mockResolvedValue({
      projectId: "DPRJ-1",
      outputs: [
        {
          id: "OUT-1",
          kind: "html",
          driveAssetId: "AST-1",
          filename: "Landing.html",
          publishStatus: "ready",
          sizeBytes: 100,
          mimeType: "text/html",
          publishedAt: "2026-06-15T12:00:00Z",
        },
      ],
    });

    const result = await listTeamverProjectOutputs("od-1");

    expect(getMock).toHaveBeenCalledWith(
      "/projects/od-1/outputs",
      expect.objectContaining({ workspaceId: "ws-1", skipAuthHeader: true }),
    );
    expect(result?.outputs[0]?.driveAssetId).toBe("AST-1");
    expect(result?.outputs[0]?.publishedAt).toBe("2026-06-15T12:00:00Z");
  });

  it("normalizes snake_case publish history", async () => {
    getMock.mockResolvedValue({
      project_id: "DPRJ-2",
      outputs: [
        {
          kind: "zip",
          drive_asset_id: "AST-2",
          publish_status: "ready",
          filename: "Landing.zip",
        },
      ],
    });

    const result = await listTeamverProjectOutputs("od-2");
    expect(result?.outputs[0]?.driveAssetId).toBe("AST-2");
  });
});

describe("findLatestReadyPublishOutput", () => {
  it("prefers matching kind", () => {
    const picked = findLatestReadyPublishOutput(
      [
        {
          id: "1",
          kind: "html",
          driveAssetId: "AST-H",
          filename: "a.html",
          sizeBytes: 1,
          mimeType: "text/html",
          publishStatus: "ready",
        },
        {
          id: "2",
          kind: "zip",
          driveAssetId: "AST-Z",
          filename: "a.zip",
          sizeBytes: 2,
          mimeType: "application/zip",
          publishStatus: "ready",
        },
      ],
      "zip",
    );
    expect(picked?.driveAssetId).toBe("AST-Z");
  });
});
