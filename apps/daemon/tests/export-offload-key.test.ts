import { describe, expect, it } from 'vitest';

import { buildExportOffloadObjectKey } from '../src/export-offload-key.js';

describe('export offload object key', () => {
  it('builds a tenant/project scoped exports key with the cache hash', () => {
    expect(
      buildExportOffloadObjectKey({
        workspaceId: 'W-TEAMVER',
        projectId: 'proj-123',
        cacheKey: 'a'.repeat(64),
        filename: 'Deck.PDF',
      }),
    ).toBe(`exports/ws_W-TEAMVER/proj_proj-123/${'a'.repeat(64)}.pdf`);
  });

  it('sanitizes scope segments and preserves only the filename extension', () => {
    expect(
      buildExportOffloadObjectKey({
        workspaceId: ' workspace / with spaces ',
        projectId: '../project:deck',
        cacheKey: 'B'.repeat(32),
        filename: 'Quarterly Deck (final).html',
      }),
    ).toBe(`exports/ws_workspace_with_spaces/proj_.._project_deck/${'b'.repeat(32)}.html`);
  });

  it('rejects non-hash cache keys to avoid user-controlled object names', () => {
    expect(() =>
      buildExportOffloadObjectKey({
        workspaceId: 'ws1',
        projectId: 'proj1',
        cacheKey: '../../artifact',
        filename: 'deck.pdf',
      }),
    ).toThrow('invalid export cache hash');
  });
});
