import { describe, expect, it } from 'vitest';
import type { FileRevision } from '@open-design/contracts';
import {
  resolveFileRevisionCoalesceWindowMs,
  shouldCoalesceRevisionPush,
} from '../src/file-revisions/coalesce.js';

const head: FileRevision = {
  id: 'rev-2',
  projectId: 'proj-1',
  fileName: 'deck.html',
  parentRevisionId: 'rev-1',
  sequence: 2,
  createdAt: 1_000,
  byteSize: 100,
  source: 'manual_edit',
  label: 'Edit 1',
};

describe('file revision coalesce', () => {
  it('defaults to a 30s window', () => {
    expect(resolveFileRevisionCoalesceWindowMs({})).toBe(30_000);
    expect(resolveFileRevisionCoalesceWindowMs({ OD_FILE_REVISION_COALESCE_WINDOW_MS: '0' })).toBe(0);
  });

  it('merges rapid manual_edit pushes into the current head', () => {
    expect(shouldCoalesceRevisionPush(head, { source: 'manual_edit', now: 20_000 })).toBe(true);
  });

  it('merges rapid agent_deck_patch pushes with the shorter agent window', () => {
    const agentHead = { ...head, source: 'agent_deck_patch' as const };
    expect(shouldCoalesceRevisionPush(
      agentHead,
      { source: 'agent_deck_patch', now: 4_000 },
      { OD_FILE_REVISION_AGENT_COALESCE_WINDOW_MS: '5000' },
    )).toBe(true);
    expect(shouldCoalesceRevisionPush(
      agentHead,
      { source: 'agent_deck_patch', now: 6_001 },
      { OD_FILE_REVISION_AGENT_COALESCE_WINDOW_MS: '5000' },
    )).toBe(false);
  });

  it('does not coalesce across sources or into baseline/import heads', () => {
    expect(shouldCoalesceRevisionPush(head, { source: 'inspect', now: 20_000 })).toBe(false);
    expect(shouldCoalesceRevisionPush(
      { ...head, sequence: 1, source: 'import' },
      { source: 'manual_edit', now: 20_000 },
    )).toBe(false);
    expect(shouldCoalesceRevisionPush(head, { source: 'manual_edit', now: 40_000 })).toBe(false);
  });
});
