import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/fetchPluginLocalSkill', () => ({
  fetchPluginPreviewLookSource: vi.fn(),
}));

import { fetchPluginPreviewLookSource } from '../../src/teamver/fetchPluginLocalSkill';
import { resolveTemplateCloneLookSeedHtml } from '../../src/teamver/seedTemplateClonedDeck';

const pluginLook = [
  '<!doctype html><html><body>',
  '<section class="slide cover"><h1>Template Cover</h1></section>',
  '<section class="slide slide-cards"><h2>Template Cards</h2></section>',
  '</body></html>',
].join('');

const overwrittenDisk = [
  '<!doctype html><html><body>',
  '<section class="slide"><h1>분기 전략</h1></section>',
  '<section class="slide"><h2>핵심 개념</h2></section>',
  '</body></html>',
].join('');

describe('resolveTemplateCloneLookSeedHtml (루프518)', () => {
  beforeEach(() => {
    vi.mocked(fetchPluginPreviewLookSource).mockReset();
  });

  it('prefers official plugin preview over MiniMax-overwritten deck.html', async () => {
    vi.mocked(fetchPluginPreviewLookSource).mockResolvedValue(pluginLook);
    await expect(resolveTemplateCloneLookSeedHtml({
      templateId: 'html-ppt-zhangzara-daisy-days',
      readProjectHtml: async () => overwrittenDisk,
    })).resolves.toBe(pluginLook);
    expect(fetchPluginPreviewLookSource).toHaveBeenCalledWith('html-ppt-zhangzara-daisy-days');
  });

  it('falls back to disk when plugin preview is unavailable', async () => {
    vi.mocked(fetchPluginPreviewLookSource).mockResolvedValue(null);
    await expect(resolveTemplateCloneLookSeedHtml({
      templateId: 'html-ppt-zhangzara-daisy-days',
      readProjectHtml: async () => overwrittenDisk,
    })).resolves.toBe(overwrittenDisk);
  });
});
