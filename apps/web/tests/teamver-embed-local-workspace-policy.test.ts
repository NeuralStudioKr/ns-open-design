import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

import { isTeamverEmbedMode } from "../src/teamver/designApiBase";
import {
  mayMutateProjectLinkedDirs,
  stripLinkedDirsFromMetadata,
} from "../src/teamver/embedLocalWorkspacePolicy";

describe("embedLocalWorkspacePolicy", () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
  });

  it("allows linkedDirs mutation outside embed", () => {
    expect(mayMutateProjectLinkedDirs()).toBe(true);
    expect(
      stripLinkedDirsFromMetadata({
        kind: "prototype",
        linkedDirs: ["/tmp/foo"],
      }).linkedDirs,
    ).toEqual(["/tmp/foo"]);
  });

  it("blocks linkedDirs mutation in embed", () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    expect(mayMutateProjectLinkedDirs()).toBe(false);
    expect(
      stripLinkedDirsFromMetadata({
        kind: "prototype",
        linkedDirs: ["/tmp/foo"],
      }).linkedDirs,
    ).toBeUndefined();
  });

  it("preserves unrelated metadata fields when stripping linkedDirs", () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    expect(
      stripLinkedDirsFromMetadata({
        kind: "prototype",
        nameSource: "user",
        linkedDirs: ["/tmp/foo"],
      }),
    ).toEqual({
      kind: "prototype",
      nameSource: "user",
    });
  });

  it("strips empty linkedDirs arrays in embed", () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    expect(
      stripLinkedDirsFromMetadata({
        kind: "prototype",
        linkedDirs: [],
      }),
    ).toEqual({ kind: "prototype" });
  });
});
