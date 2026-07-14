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
  // 803f70262 added `...TEAMVER_BFF_REQUEST_OPTIONS` at the call site to
  // disable SDK auto refresh recovery; the mock must export the constant or
  // spreading `undefined` throws before `getMock` is invoked.
  TEAMVER_BFF_REQUEST_OPTIONS: { skipAuthHeader: true, skipAuthRecovery: true },
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
          driveFolderId: "FLD-1",
          driveSharedDriveId: "SD-1",
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
    expect(result?.outputs[0]?.driveFolderId).toBe("FLD-1");
    expect(result?.outputs[0]?.driveSharedDriveId).toBe("SD-1");
    expect(result?.outputs[0]?.publishedAt).toBe("2026-06-15T12:00:00Z");
  });

  it("returns publish history in camelCase", async () => {
    getMock.mockResolvedValue({
      projectId: "DPRJ-2",
      outputs: [
        {
          kind: "zip",
          driveAssetId: "AST-2",
          driveFolderId: "FLD-2",
          driveSharedDriveId: "SD-2",
          publishStatus: "ready",
          filename: "Landing.zip",
        },
      ],
    });

    const result = await listTeamverProjectOutputs("od-2");
    expect(result?.outputs[0]?.driveAssetId).toBe("AST-2");
    expect(result?.outputs[0]?.driveFolderId).toBe("FLD-2");
    expect(result?.outputs[0]?.driveSharedDriveId).toBe("SD-2");
  });
});

describe('findLatestReadyPublishOutput', () => {
  it('prefers matching kind', () => {
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

  it('picks newest ready row when publishedAt order is unsorted', () => {
    const picked = findLatestReadyPublishOutput([
      {
        id: '1',
        kind: 'html',
        driveAssetId: 'AST-OLD',
        filename: 'old.html',
        sizeBytes: 1,
        mimeType: 'text/html',
        publishStatus: 'ready',
        publishedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        kind: 'html',
        driveAssetId: 'AST-NEW',
        filename: 'new.html',
        sizeBytes: 2,
        mimeType: 'text/html',
        publishStatus: 'ready',
        publishedAt: '2026-06-01T00:00:00Z',
      },
    ]);
    expect(picked?.driveAssetId).toBe('AST-NEW');
  });
});
