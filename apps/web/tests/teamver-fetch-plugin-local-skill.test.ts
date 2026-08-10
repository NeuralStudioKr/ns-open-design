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

  it('prepends YAML block-literal frontmatter descriptions so Zhangzara templates keep their visual contract', async () => {
    const plugin = {
      id: 'example-html-ppt-zhangzara-coral',
      manifest: {
        name: 'example-html-ppt-zhangzara-coral',
        title: 'Html Ppt Zhangzara Coral',
        description: 'manifest fallback should not be needed',
        od: {
          context: {
            skills: [{ path: './SKILL.md' }],
          },
        },
      },
    } as InstalledPluginRecord;

    const skillMd = [
      '---',
      'name: html-ppt-zhangzara-coral',
      'description: |',
      '  Coral — Cream and coral on near-black, set in oversized Bebas Neue.',
      '  Warm-graphic editorial deck.',
      '---',
      '',
      '# Coral',
      '',
      'Copy from the matching template folder.',
    ].join('\n');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(skillMd, { status: 200 })),
    );

    const local = await readPluginLocalSkillFromRecord(plugin);
    expect(local).not.toBeNull();
    expect(local!.body).toContain('## Visual summary (from template frontmatter)');
    expect(local!.body).toContain('Cream and coral on near-black');
    expect(local!.body).toContain('Bebas Neue');
    // Must not treat the bare `|` indicator as the description.
    expect(local!.body).not.toMatch(
      /## Visual summary \(from template frontmatter\)\n\n\|\n/,
    );
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
