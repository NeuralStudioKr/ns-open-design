import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InstalledPluginRecord } from '@open-design/contracts';

import { readPluginLocalSkillFromRecord } from '../src/teamver/fetchPluginLocalSkill';
import * as designApiBase from '../src/teamver/designApiBase';
import * as teamverDaemonHeaders from '../src/teamver/teamverDaemonHeaders';

describe('fetchPluginLocalSkill', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
      return new Response('---\nname: simple-deck\n---\n\nDeck visual rules body', {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(readPluginLocalSkillFromRecord(plugin)).resolves.toEqual({
      body: 'Deck visual rules body',
      name: 'Simple Deck',
    });
    expect(String(fetchMock.mock.calls[0]?.[0] ?? '')).toBe(
      '/api/plugins/example-simple-deck/asset/SKILL.md',
    );
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

  it('appends a content-swap scaffold from example.html for Daisy Days-style templates', async () => {
    vi.spyOn(designApiBase, 'isTeamverEmbedMode').mockReturnValue(false);
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
    expect(local!.body).toContain('## Template scaffold (CONTENT-SWAP BASE)');
    expect(local!.body).toContain('#F5F0E6');
    expect(local!.body).toContain('Fredoka One');
    expect(local!.body).toContain('slide slide-title');
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

  it('retries once on transient 5xx before giving up on SKILL.md', async () => {
    const plugin = {
      id: 'example-html-ppt-zhangzara-coral',
      manifest: {
        name: 'example-html-ppt-zhangzara-coral',
        title: 'Html Ppt Zhangzara Coral',
        od: {
          context: {
            skills: [{ path: './SKILL.md' }],
          },
        },
      },
    } as InstalledPluginRecord;

    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) return new Response('boom', { status: 502 });
        return new Response('---\nname: coral\n---\n\nCoral body', { status: 200 });
      }),
    );

    const local = await readPluginLocalSkillFromRecord(plugin);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(local).toEqual({ body: 'Coral body', name: 'Html Ppt Zhangzara Coral' });
  });

  it('falls back to plain same-origin asset fetch when embed daemon asset auth rejects', async () => {
    const plugin = {
      id: 'example-html-ppt-zhangzara-daisy-days',
      manifest: {
        name: 'example-html-ppt-zhangzara-daisy-days',
        title: 'Html Ppt Zhangzara Daisy Days',
        od: {
          context: {
            skills: [{ path: './SKILL.md' }],
          },
        },
      },
    } as InstalledPluginRecord;
    const skillMd = [
      '---',
      'name: html-ppt-zhangzara-daisy-days',
      'description: Daisy Days — use pasted motif sprites, not emoji.',
      '---',
      '',
      '# Daisy Days',
      '',
      'Preserve the template.',
    ].join('\n');
    vi.spyOn(designApiBase, 'isTeamverEmbedMode').mockReturnValue(true);
    const daemonFetch = vi
      .spyOn(teamverDaemonHeaders, 'fetchTeamverDaemon')
      .mockResolvedValue(new Response('session_expired', { status: 401 }));
    const plainFetch = vi.fn(async (_input: RequestInfo | URL) => (
      new Response(skillMd, { status: 200 })
    ));
    vi.stubGlobal('fetch', plainFetch);

    const local = await readPluginLocalSkillFromRecord(plugin);

    expect(daemonFetch).toHaveBeenCalledWith(
      '/api/plugins/example-html-ppt-zhangzara-daisy-days/asset/SKILL.md',
      {
        skipEmbedAuthRecovery: true,
        skipTeamverWorkspaceHeaders: true,
      },
    );
    expect(String(plainFetch.mock.calls[0]?.[0] ?? '')).toBe(
      '/api/plugins/example-html-ppt-zhangzara-daisy-days/asset/SKILL.md',
    );
    expect(local?.body).toContain('Daisy Days — use pasted motif sprites, not emoji.');
  });
});
