import { isTeamverEmbedMode } from "./designApiBase";

/** Embed surfaces: Korean copy when Teamver iframe; English otherwise. */
export function embedUiLabel(english: string, korean: string): string {
  return isTeamverEmbedMode() ? korean : english;
}
