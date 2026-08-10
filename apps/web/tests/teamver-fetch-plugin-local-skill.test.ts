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

  it('appends a compact visual kit from example.html for Daisy Days-style templates', async () => {
    const plugin = {
      id: 'example-html-ppt-zhangzara-daisy-days',
      manifest: {
        name: 'example-html-ppt-zhangzara-daisy-days',
        title: 'Html Ppt Zhangzara Daisy Days',
        od: {
          preview: { type: 'html', entry: './example.html' },
          context: {
            skills: [{ path: './SKILL.md' }],
            assets: ['./example.html'],
          },
        },
      },
    } as InstalledPluginRecord;

    const skillMd = [
      '---',
      'name: html-ppt-zhangzara-daisy-days',
      'description: |',
      '  Daisy Days — Cheerful pastel deck with hand-drawn daisies.',
      '---',
      '',
      '# Daisy Days',
      '',
      'Clone example.html into the workspace.',
    ].join('\n');
    const exampleHtml = [
      '<!DOCTYPE html><html><head>',
      '<link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Quicksand:wght@500&display=swap" rel="stylesheet">',
      '<style>:root{--cream:#F5F0E6;--turquoise:#7ECDC0;--font-display:\'Fredoka One\',cursive}</style>',
      '</head><body>',
      '<section class="slide slide-title"><h1>Daisy Days</h1></section>',
      '</body></html>',
    ].join('');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/asset/SKILL.md')) {
          return new Response(skillMd, { status: 200 });
        }
        if (String(url).includes('/asset/example.html')) {
          return new Response(exampleHtml, { status: 200 });
        }
        return new Response('missing', { status: 404 });
      }),
    );

    const local = await readPluginLocalSkillFromRecord(plugin);
    expect(local).not.toBeNull();
    expect(local!.body).toContain('## Visual summary (from template frontmatter)');
    expect(local!.body).toContain('## Template visual kit (from example.html)');
    expect(local!.body).toContain('#F5F0E6');
    expect(local!.body).toContain('Fredoka One');
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
