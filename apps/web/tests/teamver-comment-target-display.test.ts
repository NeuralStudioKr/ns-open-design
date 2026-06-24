import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

import * as designApiBase from "../src/teamver/designApiBase";
import { commentTargetDisplayName } from "../src/comments";

describe("commentTargetDisplayName embed labels", () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
  });

  it("uses English defaults outside embed mode", () => {
    expect(commentTargetDisplayName({ selectionKind: "visual" })).toBe("Visual mark");
    expect(commentTargetDisplayName({})).toBe("Annotation");
  });

  it("uses Korean labels in embed mode", () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    expect(commentTargetDisplayName({ selectionKind: "visual" })).toBe("시각 마크");
    expect(commentTargetDisplayName({})).toBe("주석");
  });
});
