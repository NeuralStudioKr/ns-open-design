import { describe, expect, it } from "vitest";

import {
  pickProjectCoverFile,
  projectPreviewDeepLinkFileName,
} from "../src/teamver/projectPreviewFile";
import type { Project, ProjectFile } from "../src/types";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Deck",
    skillId: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function file(partial: Partial<ProjectFile> & Pick<ProjectFile, "name" | "kind">): ProjectFile {
  return {
    type: "file",
    mtime: 0,
    size: 1,
    mime: "text/plain",
    ...partial,
  };
}

describe("projectPreviewFile", () => {
  it("prefers latest html for cover and preview deep-link", () => {
    const files = [
      file({ name: "old.html", kind: "html", mtime: 1 }),
      file({ name: "deck/index.html", kind: "html", mtime: 99, path: "deck/index.html" }),
    ];
    const cover = pickProjectCoverFile(project({ metadata: { kind: "deck" } }), files);
    expect(cover).toEqual({ kind: "html", name: "deck/index.html" });
    expect(projectPreviewDeepLinkFileName(project({ metadata: { kind: "deck" } }), cover)).toBe(
      "index.html",
    );
  });

  it("uses entry html when cover override is absent", () => {
    expect(
      projectPreviewDeepLinkFileName(
        project({ metadata: { kind: "deck", entryFile: "slides/deck.html" } }),
        null,
      ),
    ).toBe("deck.html");
  });

  it("returns null for non-html covers", () => {
    const cover = { kind: "image" as const, name: "hero.png" };
    expect(projectPreviewDeepLinkFileName(project(), cover)).toBeNull();
  });
});
