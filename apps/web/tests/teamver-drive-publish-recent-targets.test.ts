// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { TeamverDrivePublishTarget } from "../src/teamver/drivePublishTargets";
import {
  pushRecentPublishTarget,
  readRecentPublishTargets,
} from "../src/teamver/drivePublishRecentTargets";

const targetA: TeamverDrivePublishTarget = {
  id: "personal:folder-a",
  label: "Exports",
  description: "내 드라이브 폴더",
  folderId: "folder-a",
  sharedDriveId: null,
};

const targetB: TeamverDrivePublishTarget = {
  id: "shared:sd-1:folder-b",
  label: "Team / Slides",
  description: "팀 드라이브 폴더",
  folderId: "folder-b",
  sharedDriveId: "sd-1",
};

describe("drivePublishRecentTargets", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns empty when workspace is missing", () => {
    expect(readRecentPublishTargets(null)).toEqual([]);
    expect(readRecentPublishTargets("  ")).toEqual([]);
  });

  it("pushes targets per workspace with dedupe and max 5", () => {
    pushRecentPublishTarget("ws-1", targetA);
    pushRecentPublishTarget("ws-1", targetB);
    pushRecentPublishTarget("ws-1", targetA);

    expect(readRecentPublishTargets("ws-1").map((item) => item.id)).toEqual([
      targetA.id,
      targetB.id,
    ]);

    for (let i = 0; i < 6; i += 1) {
      pushRecentPublishTarget("ws-1", {
        ...targetA,
        id: `personal:folder-${i}`,
        folderId: `folder-${i}`,
        label: `Folder ${i}`,
      });
    }
    expect(readRecentPublishTargets("ws-1")).toHaveLength(5);
  });

  it("scopes recents by workspace id", () => {
    pushRecentPublishTarget("ws-a", targetA);
    pushRecentPublishTarget("ws-b", targetB);

    expect(readRecentPublishTargets("ws-a").map((item) => item.id)).toEqual([targetA.id]);
    expect(readRecentPublishTargets("ws-b").map((item) => item.id)).toEqual([targetB.id]);
  });
});
