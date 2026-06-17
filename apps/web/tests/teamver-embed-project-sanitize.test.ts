import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

import { isTeamverEmbedMode } from "../src/teamver/designApiBase";
import {
  mayMutateProjectLinkedDirs,
  sanitizeProjectForEmbed,
  stripLinkedDirsFromMetadata,
} from "../src/teamver/embedLocalWorkspacePolicy";
import type { ProjectMetadata } from "../src/types";

type ProjectLike = {
  id: string;
  name: string;
  metadata?: ProjectMetadata | null;
};

describe("embedLocalWorkspacePolicy project sanitization", () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
  });

  it("strips linkedDirs from loaded projects in embed", () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    const sanitized = sanitizeProjectForEmbed<ProjectLike>({
      id: "p1",
      name: "Demo",
      metadata: { kind: "prototype", linkedDirs: ["/tmp/host"] },
    });
    expect(sanitized.metadata?.linkedDirs).toBeUndefined();
  });

  it("keeps linkedDirs outside embed", () => {
    const project: ProjectLike = {
      id: "p1",
      name: "Demo",
      metadata: { kind: "prototype", linkedDirs: ["/tmp/host"] },
    };
    expect(sanitizeProjectForEmbed(project).metadata?.linkedDirs).toEqual(["/tmp/host"]);
    expect(mayMutateProjectLinkedDirs()).toBe(true);
    expect(
      stripLinkedDirsFromMetadata({ kind: "prototype", linkedDirs: ["/tmp/host"] }).linkedDirs,
    ).toEqual(["/tmp/host"]);
  });
});
