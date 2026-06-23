import { describe, expect, it } from "vitest";

import {
  clampTeamverEmbedRoute,
  teamverEmbedRouteChanged,
} from "../src/teamver/clampTeamverEmbedRoute";

const embedBranding = {
  hideNavViews: new Set(["tasks", "plugins", "integrations"] as const),
  hidePluginRegistry: true,
  slideOnlyMvp: true,
};

describe("clampTeamverEmbedRoute", () => {
  it("redirects hidden home views to Design home", () => {
    expect(clampTeamverEmbedRoute({ kind: "home", view: "plugins" }, embedBranding)).toEqual({
      kind: "home",
      view: "home",
    });
    expect(clampTeamverEmbedRoute({ kind: "home", view: "integrations" }, embedBranding)).toEqual({
      kind: "home",
      view: "home",
    });
    expect(clampTeamverEmbedRoute({ kind: "home", view: "tasks" }, embedBranding)).toEqual({
      kind: "home",
      view: "home",
    });
  });

  it("redirects design-system workspace routes in slide-only embed", () => {
    expect(clampTeamverEmbedRoute({ kind: "design-system-create" }, embedBranding)).toEqual({
      kind: "home",
      view: "home",
    });
    expect(
      clampTeamverEmbedRoute({ kind: "design-system-detail", designSystemId: "ds-1" }, embedBranding),
    ).toEqual({
      kind: "home",
      view: "home",
    });
    expect(clampTeamverEmbedRoute({ kind: "home", view: "design-systems" }, embedBranding)).toEqual({
      kind: "home",
      view: "home",
    });
  });

  it("redirects marketplace routes when plugin registry is hidden", () => {
    expect(clampTeamverEmbedRoute({ kind: "marketplace" }, embedBranding)).toEqual({
      kind: "home",
      view: "home",
    });
    expect(
      clampTeamverEmbedRoute({ kind: "marketplace-detail", pluginId: "p1" }, embedBranding),
    ).toEqual({
      kind: "home",
      view: "home",
    });
  });

  it("keeps allowed routes unchanged", () => {
    const projects = { kind: "home", view: "projects" } as const;
    const project = {
      kind: "project",
      projectId: "p1",
      conversationId: null,
      fileName: null,
    } as const;
    expect(clampTeamverEmbedRoute(projects, embedBranding)).toEqual(projects);
    expect(clampTeamverEmbedRoute(project, embedBranding)).toEqual(project);
  });

  it("detects path changes after clamp", () => {
    const original = { kind: "home", view: "plugins" } as const;
    const clamped = clampTeamverEmbedRoute(original, embedBranding);
    expect(teamverEmbedRouteChanged(original, clamped)).toBe(true);
    expect(teamverEmbedRouteChanged(original, original)).toBe(false);
  });
});
