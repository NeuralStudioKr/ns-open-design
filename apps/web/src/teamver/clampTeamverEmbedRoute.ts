import type { TeamverBrandingConfig } from "./branding/config";
import { buildPath, type Route } from "../router";

const EMBED_HOME_FALLBACK: Route = { kind: "home", view: "home" };

/** Embed — deep-link / back navigation to hidden OD surfaces → safe in-app route. */
export function clampTeamverEmbedRoute(
  route: Route,
  branding: Pick<
    TeamverBrandingConfig,
    "hideNavViews" | "hidePluginRegistry" | "slideOnlyMvp"
  >,
): Route {
  if (
    branding.hidePluginRegistry
    && (route.kind === "marketplace" || route.kind === "marketplace-detail")
  ) {
    return EMBED_HOME_FALLBACK;
  }

  if (branding.slideOnlyMvp) {
    if (route.kind === "design-system-create" || route.kind === "design-system-detail") {
      return EMBED_HOME_FALLBACK;
    }
  }

  if (route.kind === "home") {
    if (
      (route.view === "tasks" && branding.hideNavViews.has("tasks"))
      || (route.view === "plugins" && branding.hideNavViews.has("plugins"))
      || (route.view === "integrations" && branding.hideNavViews.has("integrations"))
    ) {
      return EMBED_HOME_FALLBACK;
    }
  }

  return route;
}

export function teamverEmbedRouteChanged(route: Route, clamped: Route): boolean {
  return buildPath(route) !== buildPath(clamped);
}
