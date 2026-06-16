// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getMock = vi.fn();
const getWorkspaceMock = vi.fn(async () => "ws-1");
const openMock = vi.fn();

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDriveAssetUrl: vi.fn((id: string) => `https://stg.teamver.com/drive?asset=${id}`),
}));

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    http: { get: getMock },
    workspaceStore: { get: getWorkspaceMock },
  })),
}));

import { TeamverOpenDrivePublishMenuItem } from "../src/teamver/components/TeamverOpenDrivePublishMenuItem";
import { listTeamverProjectOutputs } from "../src/teamver/listProjectOutputs";

describe("TeamverOpenDrivePublishMenuItem", () => {
  beforeEach(() => {
    cleanup();
    getMock.mockReset();
    getWorkspaceMock.mockClear();
    openMock.mockReset();
    vi.stubGlobal("open", openMock);
  });

  it("opens drive URL for latest ready html output", async () => {
    getMock.mockResolvedValue({
      projectId: "DPRJ-1",
      outputs: [
        {
          id: "OUT-1",
          kind: "html",
          driveAssetId: "AST-1",
          filename: "Landing.html",
          publishStatus: "ready",
          sizeBytes: 1,
          mimeType: "text/html",
        },
      ],
    });

    const onOpen = vi.fn();
    render(
      <TeamverOpenDrivePublishMenuItem
        projectId="od-1"
        onCloseMenu={() => {}}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByTestId("teamver-open-drive-publish-menu-item"));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        "https://stg.teamver.com/drive?asset=AST-1",
        "_blank",
        "noopener,noreferrer",
      );
    });
    expect(onOpen).toHaveBeenCalledWith("AST-1");
    await expect(listTeamverProjectOutputs("od-1")).resolves.toMatchObject({
      outputs: [{ driveAssetId: "AST-1" }],
    });
  });
});
