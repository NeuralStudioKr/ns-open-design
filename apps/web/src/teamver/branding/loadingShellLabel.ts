import { readTeamverViteEnv } from "../teamverViteEnv";
import { isTeamverEmbedBuild, TEAMVER_DEFAULT_BRAND_TITLE } from "./siteMetadata";

/**
 * Pre-mount loading shell copy.
 *
 * - Standalone OD: keep the upstream English label so non-Korean users see a
 *   familiar product name during the first paint.
 * - Embed builds: ship a Korean label keyed off the configured brand title so
 *   Teamver users don't see Open Design wording (and don't see English while
 *   the JS bundle loads in a Korean-first surface).
 */
export function resolveLoadingShellLabel(): string {
  if (!isTeamverEmbedBuild()) {
    return "Loading Open Design…";
  }

  const brandTitle =
    readTeamverViteEnv("VITE_TEAMVER_BRAND_TITLE") || TEAMVER_DEFAULT_BRAND_TITLE;
  return `${brandTitle} 불러오는 중…`;
}
