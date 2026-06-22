// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  consumeTeamverDriveLaunchHandoff,
  readTeamverDriveLaunchHandoff,
  readTeamverDriveLaunchIntent,
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

    consumeTeamverDriveLaunchHandoff();
    expect(window.location.search).toBe("");
    expect(readTeamverDriveLaunchHandoff()).toBeNull();
    expect(readTeamverDriveLaunchIntent()).toBeNull();
  });
});
