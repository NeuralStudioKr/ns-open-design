import { describe, expect, it, vi } from 'vitest';

import type { InstalledPluginRecord } from '@open-design/contracts';

import { readPluginLocalSkillFromRecord } from '../src/teamver/fetchPluginLocalSkill';

describe('fetchPluginLocalSkill', () => {
  it('loads plugin-local SKILL.md through the asset API', async () => {
    const plugin = {
      id: 'example-simple-deck',
      manifest: {
        name: 'example-simple-deck',
        title: 'Simple Deck',
        od: {
          context: {
            skills: [{ path: './SKILL.md' }],
          },
        },
      },
    } as InstalledPluginRecord;

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/plugins/example-simple-deck/asset/SKILL.md');
      return new Response('---\nname: simple-deck\n---\n\nDeck visual rules body', {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(readPluginLocalSkillFromRecord(plugin)).resolves.toEqual({
      body: 'Deck visual rules body',
      name: 'Simple Deck',
    });
  });

  it('returns null when the plugin has no local skill path', async () => {
    const plugin = {
      id: 'no-local-skill',
      manifest: {
        name: 'no-local-skill',
        od: {
          context: {
            skills: [{ ref: 'simple-deck' }],
          },
        },
      },
    } as InstalledPluginRecord;

    await expect(readPluginLocalSkillFromRecord(plugin)).resolves.toBeNull();
  });
});
