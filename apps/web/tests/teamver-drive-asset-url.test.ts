import { describe, expect, it } from "vitest";
import { resolveTeamverDriveAssetUrl } from "../src/teamver/designApiBase";

describe("resolveTeamverDriveAssetUrl", () => {
  it("builds Main FE drive deep link with encoded asset id (SSR default origin)", () => {
    expect(resolveTeamverDriveAssetUrl("AST-123")).toBe(
      "https://teamver.com/drive?asset=AST-123",
    );
    expect(resolveTeamverDriveAssetUrl(" AST-9 ")).toBe(
      "https://teamver.com/drive?asset=AST-9",
    );
  });
});
