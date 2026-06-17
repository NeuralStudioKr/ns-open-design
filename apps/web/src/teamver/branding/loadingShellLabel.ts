import { readTeamverViteEnv } from "../teamverViteEnv";
import { isTeamverEmbedBuild, TEAMVER_DEFAULT_BRAND_TITLE } from "./siteMetadata";

/** Pre-mount loading shell copy — embed builds must not mention Open Design. */
export function resolveLoadingShellLabel(): string {
  if (!isTeamverEmbedBuild()) {
    return "Loading Open Design…";
  }

  const brandTitle =
    readTeamverViteEnv("VITE_TEAMVER_BRAND_TITLE") || TEAMVER_DEFAULT_BRAND_TITLE;
  return `Loading ${brandTitle}…`;
}
