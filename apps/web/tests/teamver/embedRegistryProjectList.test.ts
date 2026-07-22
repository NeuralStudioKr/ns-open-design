import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listEmbedProjectsFromRegistry,
  listEmbedProjectsPageFromRegistry,
  mapRegistryRowToProject,
  mergeDaemonFieldsOntoRegistryProjects,
  resolveProjectDisplayName,
} from "../../src/teamver/embedRegistryProjectList";
import * as projectRegistry from "../../src/teamver/projectRegistry";
import type { TeamverRegisteredProject } from "../../src/teamver/projectRegistry";

vi.mock("../../src/teamver/projectRegistry", () => ({
  listTeamverRegistryProjects: vi.fn(),
  TeamverProjectRegistryError: class TeamverProjectRegistryError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

describe("embedRegistryProjectList", () => {
  afterEach(() => {
    vi.mocked(projectRegistry.listTeamverRegistryProjects).mockReset();
  });

  it("prefers registry title when daemon name is the od id", () => {
    expect(
      resolveProjectDisplayName({ id: "abc-123", name: "abc-123" }, "Landing deck"),
    ).toBe("Landing deck");
    expect(
      resolveProjectDisplayName({ id: "abc-123", name: "Custom" }, "Landing deck"),
    ).toBe("Custom");
  });

  it("keeps registry title over daemon uuid, generic, or artifact slug names", () => {
    expect(
      resolveProjectDisplayName(
        {
          id: "77610df3-5878-41ed-a10f-2d388ac495f3",
          name: "77610df3-5878-41ed-a10f-2d388ac495f3",
        },
        "AI 도입 발표 자료",
      ),
    ).toBe("AI 도입 발표 자료");
    expect(
      resolveProjectDisplayName({ id: "p1", name: "design" }, "AI 도입 발표 자료"),
    ).toBe("AI 도입 발표 자료");
    expect(
      resolveProjectDisplayName({ id: "p1", name: "ai-adoption-deck" }, "AI 도입 발표 자료"),
    ).toBe("AI 도입 발표 자료");
    expect(
      resolveProjectDisplayName({ id: "p1", name: "landing page" }, "AI 도입 발표 자료"),
    ).toBe("landing page");
  });

  it("maps registry rows to Project shape", () => {
    const project = mapRegistryRowToProject({
      odProjectId: "p-1",
      title: "Deck A",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(project).toMatchObject({
      id: "p-1",
      name: "Deck A",
      updatedAt: Date.parse("2026-01-02T00:00:00.000Z"),
    });
  });

  it("normalizes registry lifecycle status when design-api provides a run-like value", () => {
    expect(
      mapRegistryRowToProject({
        odProjectId: "p-complete",
        title: "Complete",
        status: "completed",
      }).status?.value,
    ).toBe("succeeded");
    expect(
      mapRegistryRowToProject({
        odProjectId: "p-active",
        title: "Active registry row",
        status: "active",
      }).status?.value,
    ).toBe("not_started");
    expect(
      mapRegistryRowToProject({
        odProjectId: "p-running",
        title: "Running",
        status: "in_progress",
      }).status?.value,
    ).toBe("running");
  });

  it("does not invent Date.now() for missing registry timestamps", () => {
    const before = Date.now();
    const project = mapRegistryRowToProject({
      odProjectId: "p-ghost",
      title: "Ghost",
    });
    expect(project.updatedAt).toBe(0);
    expect(project.createdAt).toBe(0);
    expect(project.updatedAt).toBeLessThan(before);
  });

  it("lists recent projects from registry sorted by updatedAt", async () => {
    vi.mocked(projectRegistry.listTeamverRegistryProjects).mockResolvedValue([
      {
        odProjectId: "older",
        title: "Older",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        odProjectId: "newer",
        title: "Newer",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
    ] as TeamverRegisteredProject[]);

    const projects = await listEmbedProjectsFromRegistry(1);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).toBe("newer");
  });

  it("paginates registry projects with cursor metadata", async () => {
    vi.mocked(projectRegistry.listTeamverRegistryProjects).mockResolvedValue([
      { odProjectId: "p3", title: "C", updatedAt: 3000 },
      { odProjectId: "p2", title: "B", updatedAt: 2000 },
      { odProjectId: "p1", title: "A", updatedAt: 1000 },
    ] as TeamverRegisteredProject[]);

    const first = await listEmbedProjectsPageFromRegistry({ limit: 2 });
    expect(first.projects.map((p) => p.id)).toEqual(["p3", "p2"]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = await listEmbedProjectsPageFromRegistry({
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.projects.map((p) => p.id)).toEqual(["p1"]);
    expect(second.hasMore).toBe(false);
  });

  it("merges daemon status onto registry rows without dropping membership", () => {
    const registry = [
      mapRegistryRowToProject({
        odProjectId: "ws-only",
        title: "Workspace Only",
        updatedAt: 30,
      }),
      mapRegistryRowToProject({
        odProjectId: "shared",
        title: "Shared",
        updatedAt: 20,
      }),
    ];
    const daemon = [
      {
        id: "shared",
        name: "Shared",
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 25,
        status: { value: "succeeded" as const },
        metadata: { kind: "deck" as const, entryFile: "index.html" },
      },
      {
        id: "other-tenant",
        name: "Other",
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 99,
        status: { value: "running" as const },
      },
    ];

    const merged = mergeDaemonFieldsOntoRegistryProjects(registry, daemon);
    expect(merged.map((p) => p.id)).toEqual(["ws-only", "shared"]);
    expect(merged[0]?.status?.value).toBe("not_started");
    expect(merged[1]).toMatchObject({
      id: "shared",
      name: "Shared",
      status: { value: "succeeded" },
      metadata: { kind: "deck", entryFile: "index.html" },
      updatedAt: 25,
    });
  });

  it("keeps registry terminal status when daemon status hint is stale not_started", () => {
    const registry = [
      mapRegistryRowToProject({
        odProjectId: "completed",
        title: "Completed Deck",
        status: "completed",
        updatedAt: 100,
      }),
    ];
    const daemon = [
      {
        id: "completed",
        name: "completed-deck",
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 120,
        status: { value: "not_started" as const },
      },
    ];

    const merged = mergeDaemonFieldsOntoRegistryProjects(registry, daemon);
    expect(merged[0]).toMatchObject({
      id: "completed",
      name: "Completed Deck",
      status: { value: "succeeded" },
      updatedAt: 120,
    });
  });

  it("still lets live daemon progress override a registry terminal status", () => {
    const registry = [
      mapRegistryRowToProject({
        odProjectId: "running",
        title: "Running Deck",
        status: "completed",
        updatedAt: 100,
      }),
    ];
    const daemon = [
      {
        id: "running",
        name: "running-deck",
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 130,
        status: { value: "running" as const },
      },
    ];

    const merged = mergeDaemonFieldsOntoRegistryProjects(registry, daemon);
    expect(merged[0]?.status?.value).toBe("running");
  });

  it("does not let daemon artifact slugs replace registry names in lists", () => {
    const registry = [
      mapRegistryRowToProject({
        odProjectId: "shared",
        title: "AI 도입 발표 자료",
        updatedAt: 20,
      }),
    ];
    const daemon = [
      {
        id: "shared",
        name: "ai-adoption-deck",
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 25,
        status: { value: "succeeded" as const },
      },
    ];

    const merged = mergeDaemonFieldsOntoRegistryProjects(registry, daemon);
    expect(merged[0]).toMatchObject({
      id: "shared",
      name: "AI 도입 발표 자료",
      status: { value: "succeeded" },
      updatedAt: 25,
    });
  });
});
