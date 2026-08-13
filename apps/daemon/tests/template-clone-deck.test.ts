import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../src/db.js';
import { upsertInstalledPlugin } from '../src/plugins/registry.js';
import { seedTemplateClonedDeckOnServer } from '../src/template-clone-deck.js';

afterEach(() => {
  closeDatabase();
});

describe('seedTemplateClonedDeckOnServer', () => {
  it('clones Daisy Days look from plugin FS into deck.html', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-template-clone-'));
    const pluginDir = path.join(root, 'plugin');
    const projectsRoot = path.join(root, 'projects');
    const dataDir = path.join(root, '.od');
    await mkdir(pluginDir, { recursive: true });
    await mkdir(projectsRoot, { recursive: true });

    const daisyPath = path.resolve(
      process.cwd(),
      '../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
    );
    const exampleHtml = await readFile(daisyPath, 'utf8');
    await writeFile(path.join(pluginDir, 'example.html'), exampleHtml, 'utf8');

    const db = openDatabase(root, { dataDir });
    upsertInstalledPlugin(db, {
      id: 'html-ppt-zhangzara-daisy-days',
      title: 'Html Ppt Zhangzara Daisy Days',
      version: '0.0.0',
      sourceKind: 'local',
      source: pluginDir,
      trust: 'bundled',
      capabilitiesGranted: [],
      manifest: {
        name: 'html-ppt-zhangzara-daisy-days',
        title: 'Html Ppt Zhangzara Daisy Days',
        version: '0.0.0',
        od: { preview: { entry: 'example.html' } },
      } as any,
      fsPath: pluginDir,
      installedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const written = new Map<string, string>();
    const result = await seedTemplateClonedDeckOnServer(
      {
        db,
        projectsRoot,
        projectId: 'proj-1',
        ensureProject: async () => {
          const dir = path.join(projectsRoot, 'proj-1');
          await mkdir(dir, { recursive: true });
          return dir;
        },
        writeProjectFile: async (_root, _id, name, body) => {
          written.set(name, typeof body === 'string' ? body : body.toString('utf8'));
          return { name };
        },
      },
      {
        pluginId: 'html-ppt-zhangzara-daisy-days',
        templateTitle: 'Html Ppt Zhangzara Daisy Days',
        sourceBrief:
          'Canvas title: Q3 Plan\nVisible headings: 분기 전략 / 핵심 KPI / 다음 단계\nSource preview: notes',
        deckTitle: '분기 전략',
        slideCountHint: '5-6',
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toBe('deck.html');
    const deck = written.get('deck.html');
    expect(deck).toBeTruthy();
    expect(deck).toContain('#F5F0E6');
    expect(deck).toMatch(/Fredoka/i);
    expect(deck).toContain('분기 전략');
    expect(deck).toContain('핵심 KPI');
    // Template base must stay on plugin FS — never land in user-visible refs/.
    expect(written.has('refs/template-base.html')).toBe(false);
    expect([...written.keys()]).toEqual(['deck.html']);
  });

  it('resolves bare skill id to example- installed plugin id', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-template-clone-alias-'));
    const pluginDir = path.join(root, 'plugin');
    const projectsRoot = path.join(root, 'projects');
    const dataDir = path.join(root, '.od');
    await mkdir(pluginDir, { recursive: true });
    await mkdir(projectsRoot, { recursive: true });

    const daisyPath = path.resolve(
      process.cwd(),
      '../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
    );
    await writeFile(path.join(pluginDir, 'example.html'), await readFile(daisyPath, 'utf8'), 'utf8');

    const db = openDatabase(root, { dataDir });
    upsertInstalledPlugin(db, {
      id: 'example-html-ppt-zhangzara-daisy-days',
      title: 'Html Ppt Zhangzara Daisy Days',
      version: '0.0.0',
      sourceKind: 'local',
      source: pluginDir,
      trust: 'bundled',
      capabilitiesGranted: [],
      manifest: {
        name: 'example-html-ppt-zhangzara-daisy-days',
        title: 'Html Ppt Zhangzara Daisy Days',
        version: '0.0.0',
        od: { preview: { entry: 'example.html' } },
      } as any,
      fsPath: pluginDir,
      installedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const written = new Map<string, string>();
    const result = await seedTemplateClonedDeckOnServer(
      {
        db,
        projectsRoot,
        projectId: 'proj-2',
        ensureProject: async () => {
          const dir = path.join(projectsRoot, 'proj-2');
          await mkdir(dir, { recursive: true });
          return dir;
        },
        writeProjectFile: async (_root, _id, name, body) => {
          written.set(name, typeof body === 'string' ? body : body.toString('utf8'));
          return { name };
        },
      },
      {
        // Bare skill / folder id — must alias to example- install id.
        pluginId: 'html-ppt-zhangzara-daisy-days',
        sourceBrief: 'Visible headings: Cover / Body',
        deckTitle: 'Cover',
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.templateId).toBe('example-html-ppt-zhangzara-daisy-days');
    expect(written.get('deck.html')).toContain('#F5F0E6');
  });

  it('skips stub guard on write and stamps durable seeded metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-template-clone-mark-'));
    const pluginDir = path.join(root, 'plugin');
    const projectsRoot = path.join(root, 'projects');
    const dataDir = path.join(root, '.od');
    await mkdir(pluginDir, { recursive: true });
    await mkdir(projectsRoot, { recursive: true });

    await writeFile(
      path.join(pluginDir, 'example.html'),
      `<!doctype html><html><body>
        <section class="slide"><h1>One</h1></section>
        <section class="slide"><h1>Two</h1></section>
      </body></html>`,
      'utf8',
    );

    const db = openDatabase(root, { dataDir });
    upsertInstalledPlugin(db, {
      id: 'html-ppt-mini',
      title: 'Mini',
      version: '0.0.0',
      sourceKind: 'local',
      source: pluginDir,
      trust: 'bundled',
      capabilitiesGranted: [],
      manifest: {
        name: 'html-ppt-mini',
        title: 'Mini',
        version: '0.0.0',
        od: { preview: { entry: 'example.html' } },
      } as any,
      fsPath: pluginDir,
      installedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const writeOptions: Array<Record<string, unknown>> = [];
    const marked: Array<{ projectId: string; pluginId: string; templateTitle: string }> = [];
    const result = await seedTemplateClonedDeckOnServer(
      {
        db,
        projectsRoot,
        projectId: 'proj-3',
        ensureProject: async () => {
          const dir = path.join(projectsRoot, 'proj-3');
          await mkdir(dir, { recursive: true });
          return dir;
        },
        writeProjectFile: async (_root, _id, _name, _body, options) => {
          writeOptions.push((options ?? {}) as Record<string, unknown>);
          return { name: 'deck.html' };
        },
        markTemplateClonedDeckSeeded: (input) => {
          marked.push(input);
        },
      },
      {
        pluginId: 'html-ppt-mini',
        templateTitle: 'Mini Template',
        sourceBrief: 'Visible headings: Alpha / Beta',
        deckTitle: 'Alpha',
      },
    );

    expect(result.ok).toBe(true);
    expect(writeOptions[0]?.skipArtifactStubGuard).toBe(true);
    expect(writeOptions[0]?.skipArtifactPublicationGuard).toBe(true);
    expect(writeOptions[0]?.overwrite).toBe(true);
    expect(marked).toEqual([
      {
        projectId: 'proj-3',
        pluginId: 'html-ppt-mini',
        templateTitle: 'Mini Template',
      },
    ]);
  });
});
