import { isTeamverStagingDesignHost } from "./stagingDesignHost";
import { isTeamverViteDev, readTeamverViteEnv } from "./teamverViteEnv";

/**
 * HTML FileViewer source-tab copy button.
 * Staging / local Vite on by default for deck HTML debugging; production embed
 * stays off unless `VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE=1` at image bake.
 */
export function isTeamverSourceHtmlCopyEnabled(): boolean {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE")?.toLowerCase();
  if (fromEnv === "1" || fromEnv === "true" || fromEnv === "yes") return true;
  if (fromEnv === "0" || fromEnv === "false" || fromEnv === "no") return false;
  if (isTeamverViteDev()) return true;
  return isTeamverStagingDesignHost();
}
