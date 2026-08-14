import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../src/db.js';
import {
  ensureBundledPluginRegistered,
  normalizeBundledPluginLookupId,
} from '../src/plugins/bundled.js';
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

  it('never uses marketing or instruction copy as the cloned cover title', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-template-clone-title-'));
    const pluginDir = path.join(root, 'plugin');
    const projectsRoot = path.join(root, 'projects');
    const dataDir = path.join(root, '.od');
    await mkdir(pluginDir, { recursive: true });
    await mkdir(projectsRoot, { recursive: true });

    await writeFile(
      path.join(pluginDir, 'example.html'),
      `<!doctype html><html><head><style>.slide{background:#F5F0E6}</style></head>
<body><section class="slide"><h1>Daisy Days</h1><p>Html Ppt Zhangzara Daisy Days</p></section></body></html>`,
      'utf8',
    );

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
        projectId: 'p1',
        ensureProject: async () => {
          const dir = path.join(projectsRoot, 'p1');
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
        sourceBrief: '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘',
        deckTitle: '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘',
        slideCountHint: '5-6',
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const deck = written.get('deck.html') ?? '';
    expect(deck).toMatch(/<h1[^>]*>Presentation<\/h1>/);
    expect(deck).not.toContain('Html Ppt Zhangzara Daisy Days');
    expect(deck).not.toContain('첨부한 자료를 바탕으로');
    expect(deck).not.toContain('만들어줘');
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
        userInstruction: null,
        sourceBrief: 'Visible headings: Alpha / Beta',
      },
    ]);
  });

  it('free-form prompt replaces Daisy marketing titles (not just shells)', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-template-clone-freeform-'));
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
    const marked: Array<Record<string, unknown>> = [];
    const result = await seedTemplateClonedDeckOnServer(
      {
        db,
        projectsRoot,
        projectId: 'proj-freeform',
        ensureProject: async () => {
          const dir = path.join(projectsRoot, 'proj-freeform');
          await mkdir(dir, { recursive: true });
          return dir;
        },
        writeProjectFile: async (_root, _id, name, body) => {
          written.set(name, typeof body === 'string' ? body : body.toString('utf8'));
          return { name };
        },
        markTemplateClonedDeckSeeded: (input) => {
          marked.push(input as unknown as Record<string, unknown>);
        },
      },
      {
        pluginId: 'html-ppt-zhangzara-daisy-days',
        templateTitle: 'Html Ppt Zhangzara Daisy Days',
        userInstruction: 'AI 트렌드 발표자료를 만들어줘',
        deckTitle: 'Html Ppt Zhangzara Daisy Days',
        slideCountHint: 6,
      },
    );

    expect(result.ok).toBe(true);
    const deck = written.get('deck.html') ?? '';
    expect(deck).toContain('#F5F0E6');
    expect(deck).toMatch(/AI 트렌드/);
    expect(deck).not.toContain('Daisy Days');
    expect(deck).not.toContain('cheerful presentation template');
    expect(marked[0]?.userInstruction).toBe('AI 트렌드 발표자료를 만들어줘');
  });

  it('normalizes marketplace-prefixed ids for bundled ensure', () => {
    expect(normalizeBundledPluginLookupId('open-design/example-html-ppt-zhangzara-daisy-days'))
      .toBe('example-html-ppt-zhangzara-daisy-days');
    expect(normalizeBundledPluginLookupId('html-ppt-zhangzara-daisy-days'))
      .toBe('html-ppt-zhangzara-daisy-days');
  });

  it('ensureBundledPluginRegistered accepts open-design/example-… ids', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-bundled-ensure-'));
    const bundledRoot = path.join(root, 'plugins', '_official');
    const folder = path.join(bundledRoot, 'examples', 'html-ppt-zhangzara-daisy-days');
    const dataDir = path.join(root, '.od');
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, 'open-design.json'),
      JSON.stringify({
        name: 'example-html-ppt-zhangzara-daisy-days',
        title: 'Daisy',
        version: '0.0.0',
        od: { mode: 'deck', preview: { entry: 'example.html' } },
      }),
      'utf8',
    );
    await writeFile(
      path.join(folder, 'SKILL.md'),
      '---\nname: html-ppt-zhangzara-daisy-days\n---\n',
      'utf8',
    );
    await writeFile(path.join(folder, 'example.html'), '<section class="slide"><h1>A</h1></section>', 'utf8');

    const db = openDatabase(root, { dataDir });
    const registered = await ensureBundledPluginRegistered({
      db,
      bundledRoot,
      pluginId: 'open-design/example-html-ppt-zhangzara-daisy-days',
    });
    expect(registered?.id).toBe('example-html-ppt-zhangzara-daisy-days');
  });

  it('ensureBundled + clone works when only ensure receives open-design/ prefix', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-clone-prefixed-'));
    const bundledRoot = path.join(root, 'plugins', '_official');
    const folder = path.join(bundledRoot, 'examples', 'html-ppt-mini-pref');
    const projectsRoot = path.join(root, 'projects');
    const dataDir = path.join(root, '.od');
    await mkdir(folder, { recursive: true });
    await mkdir(projectsRoot, { recursive: true });
    await writeFile(
      path.join(folder, 'open-design.json'),
      JSON.stringify({
        name: 'example-html-ppt-mini-pref',
        title: 'Mini Pref',
        version: '0.0.0',
        od: { mode: 'deck', preview: { entry: 'example.html' } },
      }),
      'utf8',
    );
    await writeFile(
      path.join(folder, 'SKILL.md'),
      '---\nname: html-ppt-mini-pref\n---\n',
      'utf8',
    );
    await writeFile(
      path.join(folder, 'example.html'),
      '<section class="slide"><h1>One</h1></section><section class="slide"><h1>Two</h1></section>',
      'utf8',
    );

    const db = openDatabase(root, { dataDir });
    const written = new Map<string, string>();
    const result = await seedTemplateClonedDeckOnServer(
      {
        db,
        projectsRoot,
        projectId: 'proj-prefixed',
        ensureProject: async () => {
          const dir = path.join(projectsRoot, 'proj-prefixed');
          await mkdir(dir, { recursive: true });
          return dir;
        },
        writeProjectFile: async (_root, _id, name, body) => {
          written.set(name, typeof body === 'string' ? body : body.toString('utf8'));
          return { name };
        },
        ensureBundledPlugin: async (pluginId) => {
          const hit = await ensureBundledPluginRegistered({
            db,
            bundledRoot,
            pluginId,
          });
          return hit ? { id: hit.id } : null;
        },
      },
      {
        pluginId: 'open-design/example-html-ppt-mini-pref',
        sourceBrief: 'Visible headings: Cover / Body',
        deckTitle: 'Cover',
      },
    );
    expect(result.ok).toBe(true);
    expect(written.get('deck.html')).toContain('Cover');
  });
});
