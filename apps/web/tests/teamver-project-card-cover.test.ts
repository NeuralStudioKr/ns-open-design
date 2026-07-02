import { describe, expect, it } from "vitest";

import { buildProjectCardCover } from "../src/teamver/projectCardCover";
import { projectCoverMediaUrl } from "../src/teamver/projectCoverMediaUrl";
import { projectCoverFileFromHint } from "../src/teamver/projectCoverHints";
import type { Project } from "../src/types";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-deck",
    name: "Deck",
    skillId: null,
    createdAt: 1,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("project card cover media URLs", () => {
  it("appends coverVersion from cover-hints as cache bust query", () => {
    const cover = projectCoverFileFromHint({
      projectId: "p-deck",
      coverKind: "html",
      coverPath: "index.html",
      coverVersion: 1_700_000_123_456,
    });
    expect(cover).toMatchObject({ kind: "html", name: "index.html", version: 1_700_000_123_456 });
    const card = buildProjectCardCover(project(), cover);
    expect(card.src).toBe(
      projectCoverMediaUrl("p-deck", "index.html", 1_700_000_123_456),
    );
    expect(card.src).toContain("?v=1700000123456");
  });

  it("uses project.updatedAt when metadata entryFile is set without hint version", () => {
    const card = buildProjectCardCover(
      project({ metadata: { kind: "deck", entryFile: "index.html" } }),
      null,
    );
    expect(card.src).toBe(
      projectCoverMediaUrl("p-deck", "index.html", 1_700_000_000_000),
    );
  });
});
