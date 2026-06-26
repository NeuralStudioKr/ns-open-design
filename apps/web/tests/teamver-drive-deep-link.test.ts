import { describe, expect, it } from "vitest";
import { TEAMVER_DRIVE_ASSET_LINK_LABEL } from "../src/teamver/teamverDriveDeepLink";

describe("teamverDriveDeepLink", () => {
  it("uses the same asset link label across publish surfaces", () => {
    expect(TEAMVER_DRIVE_ASSET_LINK_LABEL).toBe("Teamver 드라이브에서 보기");
  });
});
