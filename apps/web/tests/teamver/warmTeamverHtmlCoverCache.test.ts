import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn(),
}));

import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';
import { fetchTeamverDaemon } from '../../src/teamver/teamverDaemonHeaders';
import {
  clearHtmlCoverCacheStoreForTests,
  htmlCoverCacheKey,
  peekHtmlCoverCache,
} from '../../src/teamver/htmlCoverCacheStore';
import {
  resetTeamverProjectPreviewScopeForTests,
  seedTeamverProjectPreviewPrefixForTests,
} from '../../src/teamver/teamverProjectPreviewScope';
import { warmTeamverHtmlCoverCache } from '../../src/teamver/warmTeamverHtmlCoverCache';

describe('warmTeamverHtmlCoverCache (0806-N07)', () => {
  afterEach(() => {
    clearHtmlCoverCacheStoreForTests();
    resetTeamverProjectPreviewScopeForTests();
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(fetchTeamverDaemon).mockReset();
  });

  it('seeds htmlCoverCache from cover-html-batch using peeked preview prefix', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    seedTeamverProjectPreviewPrefixForTests('p1', '/api/projects/p1/preview/scope-1');

    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              projectId: 'p1',
              ok: true,
              file: 'deck.html',
              html: '<!doctype html><html><head></head><body><section class="slide">Hi</section></body></html>',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await warmTeamverHtmlCoverCache([
      { projectId: 'p1', file: 'deck.html', mode: 'deck' },
    ]);

    expect(fetchTeamverDaemon).toHaveBeenCalledWith(
      '/api/projects/cover-html-batch',
      expect.objectContaining({ method: 'POST' }),
    );

    const key = htmlCoverCacheKey('deck', '/api/projects/p1/raw/deck.html');
    const srcDoc = peekHtmlCoverCache(key);
    expect(srcDoc).toBeTruthy();
    expect(srcDoc).toContain('Hi');
    expect(srcDoc).toContain('/api/projects/p1/preview/scope-1/deck.html');
  });
});
