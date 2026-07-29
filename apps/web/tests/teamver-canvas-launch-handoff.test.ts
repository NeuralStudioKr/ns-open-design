// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  buildTeamverCanvasLaunchHandoffQuery,
  consumeTeamverCanvasLaunchHandoff,
  readTeamverCanvasLaunchHandoff,
} from "../src/teamver/canvasLaunchHandoff";
import { readTeamverCreateSlidesLaunchFromUrl } from "../src/teamver/canvasSlideLaunch";
import { buildTeamverDriveLaunchHandoffQuery } from "../src/teamver/driveLaunchHandoff";

describe("canvasLaunchHandoff", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("reads session/artifact/rev and display meta params", () => {
    window.history.replaceState(
      {},
      "",
      "/?teamverCanvasSessionId=s1&teamverCanvasArtifactId=a1&teamverCanvasRev=rev1&teamverCanvasTitle=Hello&teamverCanvasPreview=Body+preview&teamverCanvasSections=3&teamverDriveIntent=create-slides",
    );
    expect(readTeamverCanvasLaunchHandoff()).toEqual({
      sessionId: "s1",
      artifactId: "a1",
      revision: "rev1",
      title: "Hello",
      preview: "Body preview",
      sectionCount: 3,
      updatedAt: "rev1",
    });
  });

  it("builds and consumes canvas handoff query including display meta", () => {
    const q = buildTeamverCanvasLaunchHandoffQuery({
      sessionId: "sess",
      artifactId: "art",
      revision: "r2",
      title: "Doc",
      preview: "Preview text",
      sectionCount: 2,
      headings: ["Intro", "Goals"],
      updatedAt: "2026-07-15T00:00:00Z",
    });
    expect(q).toContain("teamverCanvasSessionId=sess");
    expect(q).toContain("teamverCanvasArtifactId=art");
    expect(q).toContain("teamverCanvasRev=r2");
    expect(q).toContain("teamverCanvasTitle=Doc");
    expect(q).toContain("teamverCanvasPreview=Preview");
    expect(q).toContain("teamverCanvasSections=2");
    expect(q).toContain("teamverCanvasHeading=Intro");
    expect(q).toContain("teamverCanvasHeading=Goals");
    expect(q).toContain("teamverDriveIntent=create-slides");

    window.history.replaceState({}, "", `/${q}`);
    consumeTeamverCanvasLaunchHandoff();
    expect(window.location.search).toBe("");
    expect(readTeamverCanvasLaunchHandoff()).toBeNull();
  });
});

describe("readTeamverCreateSlidesLaunchFromUrl", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("prefers Canvas T2 handoff without consuming URL params", () => {
    window.history.replaceState(
      {},
      "",
      "/?teamverCanvasSessionId=s1&teamverCanvasArtifactId=a1&teamverDriveIntent=create-slides",
    );
    expect(readTeamverCreateSlidesLaunchFromUrl()).toEqual({
      kind: "canvas",
      handoff: expect.objectContaining({ sessionId: "s1", artifactId: "a1" }),
    });
    expect(window.location.search).toContain("teamverCanvasSessionId=s1");
  });

  it("reads Drive create-slides handoff without consuming URL params", () => {
    const q = buildTeamverDriveLaunchHandoffQuery(
      [{ assetId: "AST-1", filename: "brief.pdf", mimeType: "application/pdf" }],
      { intent: "create-slides" },
    );
    window.history.replaceState({}, "", `/${q}`);
    expect(readTeamverCreateSlidesLaunchFromUrl()).toEqual({
      kind: "drive",
      asset: {
        assetId: "AST-1",
        filename: "brief.pdf",
        mimeType: "application/pdf",
      },
    });
    expect(window.location.search).toContain("teamverDriveAssetId=AST-1");
    expect(window.location.search).toContain("teamverDriveIntent=create-slides");
  });
});
