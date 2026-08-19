import { describe, expect, it } from "vitest";

import {
  projectListCardCategory,
  withTeamverSlideListKind,
} from "../../src/teamver/projectListCardCategory";
import type { Project } from "../../src/types";

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

describe("projectListCardCategory", () => {
  it("falls back to prototype when kind is missing (Open Design)", () => {
    expect(projectListCardCategory(project())).toBe("prototype");
    expect(projectListCardCategory(project({ metadata: { kind: "other" } }))).toBe("prototype");
  });

  it("classifies deck / media / live-artifact when not slide-only", () => {
    expect(projectListCardCategory(project({ metadata: { kind: "deck" } }))).toBe("slide");
    expect(projectListCardCategory(project({ metadata: { kind: "image" } }))).toBe("media");
    expect(
      projectListCardCategory(project({ skillId: "live-artifact" })),
    ).toBe("live-artifact");
  });

  it("forces slide for Teamver slide-only lists even when kind is missing or prototype", () => {
    expect(projectListCardCategory(project(), { slideOnly: true })).toBe("slide");
    expect(
      projectListCardCategory(project({ metadata: { kind: "prototype" } }), { slideOnly: true }),
    ).toBe("slide");
    expect(
      projectListCardCategory(project({ metadata: { kind: "image" } }), { slideOnly: true }),
    ).toBe("slide");
  });
});

describe("withTeamverSlideListKind", () => {
  it("seeds deck and keeps other metadata", () => {
    expect(withTeamverSlideListKind(undefined)).toEqual({ kind: "deck" });
    expect(withTeamverSlideListKind({ kind: "prototype", entryFile: "index.html" })).toEqual({
      kind: "deck",
      entryFile: "index.html",
    });
  });
});
