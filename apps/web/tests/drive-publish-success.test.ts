import { describe, expect, it } from "vitest";
import { buildDrivePublishToastContent } from "../src/teamver/drivePublishSuccess";
import type { TeamverPublishDriveOutput } from "../src/teamver/publishToDrive";

function output(partial: Partial<TeamverPublishDriveOutput>): TeamverPublishDriveOutput {
  return {
    id: "1",
    kind: "pdf",
    driveAssetId: "AST-1",
    filename: "Deck.pdf",
    sizeBytes: 100,
    mimeType: "application/pdf",
    publishStatus: "ready",
    ...partial,
  };
}

describe("buildDrivePublishToastContent", () => {
  it("builds multi-link toasts for partial publish success", () => {
    const toast = buildDrivePublishToastContent(
      [
        output({ kind: "pdf", driveAssetId: "AST-PDF" }),
        { ...output({ kind: "html", driveAssetId: "" }), publishStatus: "failed", errorCode: "od_daemon_export_failed" },
      ],
      true,
      "pdf",
    );
    expect(toast.message).toContain("일부만");
    expect(toast.detailLinks).toHaveLength(1);
    expect(toast.alternateFormat).toBe("html");
  });
});
