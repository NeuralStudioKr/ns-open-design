import { isTeamverEmbedMode } from "./designApiBase";

export function shouldInjectOdPersonalMemoryIntoPrompt(): boolean {
  return !isTeamverEmbedMode();
}
