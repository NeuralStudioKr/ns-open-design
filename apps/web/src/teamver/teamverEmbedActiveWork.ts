/** Tracks in-flight slide/chat work so passive 401s do not hard-navigate away. */
let activeWorkDepth = 0;

export function beginTeamverEmbedActiveWork(): void {
  activeWorkDepth += 1;
}

export function endTeamverEmbedActiveWork(): void {
  activeWorkDepth = Math.max(0, activeWorkDepth - 1);
}

export function hasTeamverEmbedActiveWork(): boolean {
  return activeWorkDepth > 0;
}

/** @internal vitest only */
export function resetTeamverEmbedActiveWorkForTests(): void {
  activeWorkDepth = 0;
}
