import { isTeamverEmbedMode } from "../designApiBase";
import { isTeamverEmbedBuild } from "./siteMetadata";

/**
 * Warm cream used by Teamver Main chrome around the Design iframe.
 * Near-white `#faf9f7` / `#fff` flash against that frame — keep bootstrap
 * shells on this tone so chunk → gate → route never pop as a white card.
 */
export const TEAMVER_EMBED_LOADING_BG = "#F4EFE6";

/** Single visible bootstrap copy — never swap brand/English mid-sequence. */
export const TEAMVER_EMBED_LOADING_LABEL = "불러오는 중…";

export function isEmbedLoadingSurface(): boolean {
  return isTeamverEmbedBuild() || isTeamverEmbedMode();
}

/**
 * Pre-mount / gate / deep-link loading copy.
 * Embed: one fixed Korean string so dynamic-import → gate → entry never
 * rewrite the label (that rewrite reads as flicker).
 */
export function resolveLoadingShellLabel(): string {
  if (isEmbedLoadingSurface()) {
    return TEAMVER_EMBED_LOADING_LABEL;
  }
  return "Loading Open Design…";
}

/** @deprecated alias — same as resolveLoadingShellLabel */
export function resolveEmbedBootstrapLoadingLabel(): string {
  return resolveLoadingShellLabel();
}
