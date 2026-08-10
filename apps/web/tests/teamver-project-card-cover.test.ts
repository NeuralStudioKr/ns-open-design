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
    expect(card.filePath).toBe("index.html");
    expect(card.version).toBe(1_700_000_123_456);
  });

  it("does not thumb a bad Canvas entryFile pin for deck projects without an override", () => {
    const card = buildProjectCardCover(
      project({ metadata: { kind: "deck", entryFile: "index.html" } }),
      null,
    );
    expect(card.kind).toBe("fallback");
    expect(card.src).toBeUndefined();
  });

  it("uses cover-hints version to cache-bust trusted deck.html thumbs", () => {
    const card = buildProjectCardCover(
      project({ metadata: { kind: "deck", entryFile: "deck.html" } }),
      { kind: "html", name: "deck.html", version: 1_700_000_555_000 },
    );
    expect(card.src).toBe(projectCoverMediaUrl("p-deck", "deck.html", 1_700_000_555_000));
    expect(card.src).toContain("?v=1700000555000");
    expect(card.version).toBe(1_700_000_555_000);
  });

  it("does not fall back image cover version to project.updatedAt", () => {
    const card = buildProjectCardCover(project({ id: "p-img", name: "Shot" }), {
      kind: "image",
      name: "cover.png",
    });
    expect(card.kind).toBe("image");
    expect(card.version).toBeUndefined();
    expect(card.src).toBe(projectCoverMediaUrl("p-img", "cover.png"));
  });

  it("exposes filePath for image covers so Teamver can mint S3 GET URLs", () => {
    const cover = projectCoverFileFromHint({
      projectId: "p-img",
      coverKind: "image",
      coverPath: "msczyywd-drawing-2026-08-03T08-58-43-316Z.png",
      coverVersion: 1_700_000_999_000,
    });
    const card = buildProjectCardCover(project({ id: "p-img", name: "Shot" }), cover);
    expect(card.kind).toBe("image");
    expect(card.filePath).toBe("msczyywd-drawing-2026-08-03T08-58-43-316Z.png");
    expect(card.version).toBe(1_700_000_999_000);
    // Raw URL remains for non-Teamver / video-html consumers, but thumbs must
    // prefer filePath + AuthenticatedProjectFileImage (presign).
    expect(card.src).toContain("/raw/msczyywd-drawing-2026-08-03T08-58-43-316Z.png");
  });
});
