// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  buildTeamverCanvasLaunchHandoffQuery,
  consumeTeamverCanvasLaunchHandoff,
  readTeamverCanvasLaunchHandoff,
} from "../src/teamver/canvasLaunchHandoff";

describe("canvasLaunchHandoff", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("reads session/artifact/rev and create-slides intent params", () => {
    window.history.replaceState(
      {},
      "",
      "/?teamverCanvasSessionId=s1&teamverCanvasArtifactId=a1&teamverCanvasRev=rev1&teamverDriveIntent=create-slides",
    );
    expect(readTeamverCanvasLaunchHandoff()).toEqual({
      sessionId: "s1",
      artifactId: "a1",
      revision: "rev1",
    });
  });

  it("builds and consumes canvas handoff query", () => {
    const q = buildTeamverCanvasLaunchHandoffQuery({
      sessionId: "sess",
      artifactId: "art",
      revision: "r2",
    });
    expect(q).toContain("teamverCanvasSessionId=sess");
    expect(q).toContain("teamverCanvasArtifactId=art");
    expect(q).toContain("teamverCanvasRev=r2");
    expect(q).toContain("teamverDriveIntent=create-slides");

    window.history.replaceState({}, "", `/${q}`);
    consumeTeamverCanvasLaunchHandoff();
    expect(window.location.search).toBe("");
    expect(readTeamverCanvasLaunchHandoff()).toBeNull();
  });
});
