import { describe, expect, it } from "vitest";

import type { PetTaskSummary } from "../src/components/pet/PetOverlay";
import type { Project } from "../src/types";
import {
  patchEmbedBackgroundRunNoticeForProject,
  patchEmbedBackgroundRunSummaryForProject,
  projectAffectsEmbedBackgroundRunSurfaces,
} from "../src/teamver/embedBackgroundRunSurfaces";

const project: Project = {
  id: "p1",
  name: "Deck A",
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
  metadata: { kind: "deck", entryFile: "output/v1.html" },
};

describe("projectAffectsEmbedBackgroundRunSurfaces", () => {
  it("is false when only unrelated fields change", () => {
    const previous: Project = {
      ...project,
      updatedAt: 1,
      skillId: "skill-a",
    };
    const updated: Project = {
      ...previous,
      updatedAt: 99,
      skillId: "skill-b",
    };
    expect(projectAffectsEmbedBackgroundRunSurfaces(previous, updated)).toBe(false);
  });

  it("is true when name or entryFile changes", () => {
    expect(
      projectAffectsEmbedBackgroundRunSurfaces(project, { ...project, name: "Renamed" }),
    ).toBe(true);
    expect(
      projectAffectsEmbedBackgroundRunSurfaces(project, {
        ...project,
        metadata: { kind: "deck", entryFile: "output/v2.html" },
      }),
    ).toBe(true);
  });
});

describe("patchEmbedBackgroundRunNoticeForProject", () => {
  it("updates reopen extras when entryFile changes on success toast", () => {
    const notice = {
      runId: "r1",
      projectId: "p1",
      projectName: "Old",
      conversationId: "conv-1",
      status: "succeeded" as const,
      reopenExtras: { conversationId: "conv-1", fileName: "output/v0.html" },
    };
    const updated = patchEmbedBackgroundRunNoticeForProject(notice, project);
    expect(updated?.projectName).toBe("Deck A");
    expect(updated?.reopenExtras.fileName).toBe("v1.html");
  });

  it("leaves unrelated notices unchanged", () => {
    const notice = {
      runId: "r1",
      projectId: "p-other",
      projectName: "Other",
      conversationId: null,
      status: "failed" as const,
      reopenExtras: {},
    };
    expect(patchEmbedBackgroundRunNoticeForProject(notice, project)).toBe(notice);
  });
});

describe("patchEmbedBackgroundRunSummaryForProject", () => {
  it("syncs preview deep-link file name from project metadata", () => {
    const summary: PetTaskSummary = {
      projectId: "p1",
      projectName: "Old",
      status: "running",
      count: 1,
      previewFileName: "output/v0.html",
    };
    const patched = patchEmbedBackgroundRunSummaryForProject(summary, project);
    expect(patched.projectName).toBe("Deck A");
    expect(patched.previewFileName).toBe("v1.html");
  });

  it("returns the same summary reference when metadata is unchanged", () => {
    const summary: PetTaskSummary = {
      projectId: "p1",
      projectName: "Deck A",
      status: "running",
      count: 1,
      previewFileName: "v1.html",
    };
    expect(patchEmbedBackgroundRunSummaryForProject(summary, project)).toBe(summary);
  });
});
