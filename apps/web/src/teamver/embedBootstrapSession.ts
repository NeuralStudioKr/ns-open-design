import type { DesignAuthSession } from './designBffClient';

export type EmbedBootstrapSessionSnapshot = {
  session: DesignAuthSession;
  activeWorkspaceId: string | null;
};

let snapshot: EmbedBootstrapSessionSnapshot | null = null;

/** Seed from App boot (or auth callback) so embed UI hydrates without a second loading pass. */
export function seedEmbedBootstrapSession(input: EmbedBootstrapSessionSnapshot): void {
  snapshot = input;
}

export function peekEmbedBootstrapSession(): EmbedBootstrapSessionSnapshot | null {
  return snapshot;
}

/** @internal vitest only */
export function resetEmbedBootstrapSessionForTests(): void {
  snapshot = null;
}
