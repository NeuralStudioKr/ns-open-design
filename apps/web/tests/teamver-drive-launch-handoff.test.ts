// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  buildTeamverDriveLaunchHandoffQuery,
  consumeTeamverDriveLaunchHandoff,
  readTeamverDriveLaunchHandoff,
  readTeamverDriveLaunchHandoffAssets,
  readTeamverDriveLaunchIntent,
  TEAMVER_DRIVE_LAUNCH_HANDOFF_MAX,
} from "../src/teamver/driveLaunchHandoff";

describe("driveLaunchHandoff", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("reads and consumes Canvas create-slides handoff query params", () => {
    window.history.replaceState(
      {},
      "",
      "/?teamverDriveAssetId=AST-1&teamverDriveAssetName=canvas.html&teamverDriveAssetMimeType=text/html&teamverDriveIntent=create-slides",
    );

    expect(readTeamverDriveLaunchIntent()).toBe("create-slides");
    expect(readTeamverDriveLaunchHandoff()).toEqual({
      assetId: "AST-1",
      filename: "canvas.html",
      mimeType: "text/html",
    });
    expect(readTeamverDriveLaunchHandoffAssets()).toEqual([
      {
        assetId: "AST-1",
        filename: "canvas.html",
        mimeType: "text/html",
      },
    ]);

    consumeTeamverDriveLaunchHandoff();
    expect(window.location.search).toBe("");
    expect(readTeamverDriveLaunchHandoff()).toBeNull();
    expect(readTeamverDriveLaunchIntent()).toBeNull();
  });

  it("reads multiple assets from repeated query params", () => {
    window.history.replaceState(
      {},
      "",
      "/?teamverDriveAssetId=AST-1&teamverDriveAssetName=logo.png&teamverDriveAssetMimeType=image/png"
        + "&teamverDriveAssetId=AST-2&teamverDriveAssetName=data.csv&teamverDriveAssetMimeType=text/csv",
    );

    expect(readTeamverDriveLaunchHandoffAssets()).toEqual([
      { assetId: "AST-1", filename: "logo.png", mimeType: "image/png" },
      { assetId: "AST-2", filename: "data.csv", mimeType: "text/csv" },
    ]);
  });

  it("builds repeated query params for multi-asset launch", () => {
    const query = buildTeamverDriveLaunchHandoffQuery([
      { assetId: "AST-1", filename: "logo.png", mimeType: "image/png" },
      { assetId: "AST-2", filename: "data.csv" },
    ]);
    expect(query).toContain("teamverDriveAssetId=AST-1");
    expect(query).toContain("teamverDriveAssetId=AST-2");
    expect(query).toContain("teamverDriveAssetName=logo.png");
    expect(query).toContain("teamverDriveAssetName=data.csv");

    window.history.replaceState({}, "", `/${query}`);
    expect(readTeamverDriveLaunchHandoffAssets()).toHaveLength(2);
  });

  it("caps multi-asset handoff at import modal limit", () => {
    const assets = Array.from({ length: TEAMVER_DRIVE_LAUNCH_HANDOFF_MAX + 3 }, (_, index) => ({
      assetId: `AST-${index + 1}`,
      filename: `file-${index + 1}.png`,
    }));
    expect(buildTeamverDriveLaunchHandoffQuery(assets).match(/teamverDriveAssetId=/g)).toHaveLength(
      TEAMVER_DRIVE_LAUNCH_HANDOFF_MAX,
    );
  });
});
