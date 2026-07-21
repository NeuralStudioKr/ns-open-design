import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPlugin,
  contributeGeneratedPluginToOpenDesign,
  createProject,
  createPluginShareProject,
  getInstalledPlugin,
  importClaudeDesignZip,
  importFolderProject,
  installGeneratedPluginFolder,
  listPlugins,
  listPluginsPage,
  pickLocalFolderPath,
  publishGeneratedPluginToGitHub,
} from '../../src/state/projects';

describe('applyPlugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes the current locale to the daemon apply endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        query: '生成一份简报。',
        contextItems: [],
        inputs: [],
        assets: [],
        mcpServers: [],
        projectMetadata: {},
        trust: 'trusted',
        capabilitiesGranted: [],
        capabilitiesRequired: [],
        appliedPlugin: {
          snapshotId: 'snap-1',
          pluginId: 'sample-plugin',
          pluginVersion: '1.0.0',
          manifestSourceDigest: 'a'.repeat(64),
          inputs: {},
          resolvedContext: { items: [] },
          capabilitiesGranted: [],
          capabilitiesRequired: [],
          assetsStaged: [],
          taskKind: 'new-generation',
          appliedAt: 0,
          connectorsRequired: [],
          connectorsResolved: [],
          mcpServers: [],
          status: 'fresh',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await applyPlugin('sample-plugin', { locale: 'zh-CN' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      inputs: {},
      grantCaps: [],
      locale: 'zh-CN',
    });
  });
});

describe('createProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves daemon validation messages from non-2xx create responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        error: {
          message: 'draft design systems cannot be used by projects',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createProject({
      name: 'Draft DS project',
      skillId: null,
      designSystemId: 'user:draft-system',
    })).rejects.toThrow('draft design systems cannot be used by projects');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});

describe('listPlugins', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests deck catalog in embed slide-only mode', async () => {
    const designApiBase = await import('../../src/teamver/designApiBase');
    const branding = await import('../../src/teamver/branding/config');
    const embedSpy = vi.spyOn(designApiBase, 'isTeamverEmbedMode').mockReturnValue(true);
    const brandingSpy = vi.spyOn(branding, 'resolveTeamverBranding').mockReturnValue({ slideOnlyMvp: true } as never);
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ plugins: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await listPlugins();

    expect(fetchMock).toHaveBeenCalledWith('/api/plugins?mode=deck&limit=24');
    embedSpy.mockRestore();
    brandingSpy.mockRestore();
  });

  it('hides plugins marked od.hidden from UI-facing lists', async () => {
    const visible = {
      id: 'od-new-generation',
      title: 'New generation',
      manifest: { od: { kind: 'scenario' } },
    };
    const hidden = {
      id: 'od-default',
      title: 'Default design router',
      manifest: { od: { kind: 'scenario', hidden: true } },
    };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ plugins: [hidden, visible] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const rows = await listPlugins();

    expect(rows.map((row) => row.id)).toEqual(['od-new-generation']);
  });

  it('can include hidden plugins for installed-entry matching', async () => {
    const visible = {
      id: 'od-new-generation',
      title: 'New generation',
      manifest: { od: { kind: 'scenario' } },
    };
    const hidden = {
      id: 'od-default',
      title: 'Default design router',
      manifest: { od: { kind: 'scenario', hidden: true } },
    };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ plugins: [hidden, visible] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const rows = await listPlugins({ includeHidden: true });

    expect(rows.map((row) => row.id)).toEqual(['od-default', 'od-new-generation']);
  });

  it('passes catalog query and page options to the daemon', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ plugins: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await listPlugins({ mode: 'deck', query: 'terminal deck', limit: 12, offset: 24 });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins?mode=deck&q=terminal+deck&limit=12&offset=24',
    );
  });

  it('returns catalog pagination metadata', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        plugins: [{ id: 'deck-a', title: 'Deck A', manifest: { od: { mode: 'deck' } } }],
        total: 91,
        limit: 24,
        offset: 48,
        nextOffset: 72,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const page = await listPluginsPage({ mode: 'deck', limit: 24, offset: 48 });

    expect(page.plugins.map((plugin) => plugin.id)).toEqual(['deck-a']);
    expect(page).toMatchObject({
      total: 91,
      limit: 24,
      offset: 48,
      nextOffset: 72,
    });
  });
});

describe('getInstalledPlugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches a plugin by id outside the paginated community list', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins/example-simple-deck') {
        return new Response(
          JSON.stringify({
            id: 'example-simple-deck',
            title: 'Simple Deck',
            manifest: { od: { mode: 'deck' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const plugin = await getInstalledPlugin('example-simple-deck');

    expect(plugin?.id).toBe('example-simple-deck');
    expect(fetchMock).toHaveBeenCalledWith('/api/plugins/example-simple-deck');
  });

  it('returns null when slide-only embed filters the plugin out', async () => {
    const designApiBase = await import('../../src/teamver/designApiBase');
    const branding = await import('../../src/teamver/branding/config');
    const embedSpy = vi.spyOn(designApiBase, 'isTeamverEmbedMode').mockReturnValue(true);
    const brandingSpy = vi.spyOn(branding, 'resolveTeamverBranding').mockReturnValue({ slideOnlyMvp: true } as never);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        id: 'example-guizang-ppt',
        title: 'Guizang PPT',
        manifest: { od: { mode: 'deck' } },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const plugin = await getInstalledPlugin('example-guizang-ppt');

    expect(plugin).toBeNull();
    embedSpy.mockRestore();
    brandingSpy.mockRestore();
  });
});

describe('installGeneratedPluginFolder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('installs a project-relative generated plugin folder', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          plugin: { id: 'generated-plugin', title: 'Generated Plugin' },
          warnings: [],
          message: 'Installed Generated Plugin.',
          log: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    const outcome = await installGeneratedPluginFolder('project-1', 'generated-plugin');

    expect(outcome.ok).toBe(true);
    expect(fetchDaemonSpy).toHaveBeenCalledWith(
      '/api/projects/project-1/plugins/install-folder',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'generated-plugin' }),
      }),
    );
    expect(dispatchEvent).toHaveBeenCalled();
    fetchDaemonSpy.mockRestore();
  });

  it('preserves install diagnostics from non-2xx project folder responses', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          warnings: ['Missing open-design.json'],
          message: 'Plugin validation failed.',
          log: ['Validating generated-plugin'],
        }),
        { status: 400, headers: { 'content-type': 'application/json' }, statusText: 'Bad Request' },
      ),
    );

    const outcome = await installGeneratedPluginFolder('project-1', 'generated-plugin');

    expect(outcome).toMatchObject({
      ok: false,
      warnings: ['Missing open-design.json'],
      message: 'Plugin validation failed.',
      log: ['Validating generated-plugin'],
    });
    fetchDaemonSpy.mockRestore();
  });
});

describe('importClaudeDesignZip', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves daemon import errors from non-2xx responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: 'Unable to unpack Claude export.' }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['zip-bytes'], 'claude-design.zip', {
      type: 'application/zip',
    });

    await expect(importClaudeDesignZip(file)).rejects.toThrow(
      'Unable to unpack Claude export.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/import/claude-design',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
  });
});

describe('generated plugin share actions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts publish and contribute actions for project-relative plugin folders', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        ok: true,
        message: 'Ready',
        url: 'https://github.com/example/generated-plugin',
        log: ['ok'],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const publish = await publishGeneratedPluginToGitHub('project-1', 'generated-plugin');
    const contribute = await contributeGeneratedPluginToOpenDesign('project-1', 'generated-plugin');

    expect(publish).toMatchObject({ ok: true, message: 'Ready' });
    expect(contribute).toMatchObject({ ok: true, message: 'Ready' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1/plugins/publish-github',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'generated-plugin' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/plugins/contribute-open-design',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'generated-plugin' }),
      }),
    );
  });
});

describe('createPluginShareProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an agent-backed share project for an installed plugin', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        ok: true,
        project: {
          id: 'project-1',
          name: 'Publish to GitHub: Sample Plugin',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 1,
          pendingPrompt: 'Publish it',
          metadata: { kind: 'prototype' },
        },
        conversationId: 'conversation-1',
        appliedPluginSnapshotId: 'snapshot-1',
        actionPluginId: 'od-plugin-publish-github',
        sourcePluginId: 'sample-plugin',
        stagedPath: 'plugin-source/sample-plugin',
        prompt: 'Publish it',
        message: 'Created a Publish to GitHub task.',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await createPluginShareProject(
      'sample-plugin',
      'publish-github',
      'zh-CN',
    );

    expect(outcome).toMatchObject({
      ok: true,
      project: { id: 'project-1' },
      appliedPluginSnapshotId: 'snapshot-1',
      stagedPath: 'plugin-source/sample-plugin',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/sample-plugin/share-project',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'publish-github', locale: 'zh-CN' }),
      }),
    );
  });

  it('surfaces share project errors from the daemon', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        ok: false,
        code: 'share-action-plugin-missing',
        message: 'Restart the daemon.',
      }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await createPluginShareProject(
      'sample-plugin',
      'contribute-open-design',
    );

    expect(outcome).toEqual({
      ok: false,
      code: 'share-action-plugin-missing',
      message: 'Restart the daemon.',
    });
  });
});

describe('importFolderProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the project on success', async () => {
    const response = {
      project: { id: 'p-1', name: 'My Folder' },
      conversationId: 'conv-1',
      entryFile: 'index.html',
    };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const result = await importFolderProject({ baseDir: '/home/user/project' });
    expect(result).toMatchObject({ project: { id: 'p-1' }, entryFile: 'index.html' });
  });

  it('throws with daemon error message for filesystem root', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'cannot import the filesystem root' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )));

    await expect(importFolderProject({ baseDir: '/' }))
      .rejects.toThrow('cannot import the filesystem root');
  });

  it('throws with daemon error message for non-existent folder', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'folder not found' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )));

    await expect(importFolderProject({ baseDir: '/abc/xyz/notexist' }))
      .rejects.toThrow('folder not found');
  });

  it('throws with daemon error message for file path', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'path must be a directory' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )));

    await expect(importFolderProject({ baseDir: '/etc/hosts' }))
      .rejects.toThrow('path must be a directory');
  });

  it('throws a fallback message when response body has no error detail', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      'Internal Server Error',
      { status: 500 },
    )));

    await expect(importFolderProject({ baseDir: '/some/path' }))
      .rejects.toThrow('Failed to import folder');
  });
});

describe('pickLocalFolderPath', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the selected native folder path', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ path: '/Users/me/Site' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(pickLocalFolderPath()).resolves.toBe('/Users/me/Site');
    expect(fetchMock).toHaveBeenCalledWith('/api/dialog/open-folder', {
      method: 'POST',
    });
  });

  it('returns null when the native picker is cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ path: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    await expect(pickLocalFolderPath()).resolves.toBeNull();
  });

  it('throws with the daemon picker error message', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: 'cross-origin request rejected' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )));

    await expect(pickLocalFolderPath()).rejects.toThrow('cross-origin request rejected');
  });
});

describe('conversation daemon auth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listConversations rethrows TeamverDaemonUnauthorizedError instead of returning []', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { listConversations } = await import('../../src/state/projects');

    await expect(listConversations('project-1')).rejects.toMatchObject({
      message: 'teamver_daemon_unauthorized',
    });
    fetchDaemonSpy.mockRestore();
  });

  it('listMessages rethrows TeamverDaemonUnauthorizedError instead of returning []', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { listMessages } = await import('../../src/state/projects');

    await expect(listMessages('project-1', 'conv-1')).rejects.toMatchObject({
      message: 'teamver_daemon_unauthorized',
    });
    fetchDaemonSpy.mockRestore();
  });

  it('listMessages throws on non-OK responses instead of returning []', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('upstream', { status: 502 }));
    const { listMessages } = await import('../../src/state/projects');

    await expect(listMessages('project-1', 'conv-1')).rejects.toThrow(/Failed to list messages \(502\)/);
    fetchDaemonSpy.mockRestore();
  });

  it('listConversations throws on non-OK responses instead of returning []', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('upstream', { status: 503 }));
    const { listConversations } = await import('../../src/state/projects');

    await expect(listConversations('project-1')).rejects.toThrow(/Failed to list conversations \(503\)/);
    fetchDaemonSpy.mockRestore();
  });

  it('getProject rethrows TeamverDaemonUnauthorizedError instead of registry fallback', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { getProject } = await import('../../src/state/projects');

    await expect(getProject('project-1')).rejects.toMatchObject({
      message: 'teamver_daemon_unauthorized',
    });
    fetchDaemonSpy.mockRestore();
  });

  it('loadTabs keeps cached tabs on daemon 401 instead of throwing', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { loadTabs } = await import('../../src/state/projects');

    await expect(loadTabs('project-1')).resolves.toEqual({ tabs: [], active: null });
    fetchDaemonSpy.mockRestore();
  });

  it('getProjectFailSoft returns null on daemon 401', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { getProjectFailSoft } = await import('../../src/state/projects');

    await expect(getProjectFailSoft('project-1')).resolves.toBeNull();
    fetchDaemonSpy.mockRestore();
  });

  it('patchProject returns null on daemon 401 without throwing', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { patchProject } = await import('../../src/state/projects');

    await expect(patchProject('project-1', { name: 'Renamed' })).resolves.toBeNull();
    fetchDaemonSpy.mockRestore();
  });

  it('deleteProject returns false on daemon 401 without throwing', async () => {
    const fetchDaemonSpy = vi.spyOn(
      await import('../../src/teamver/teamverDaemonHeaders'),
      'fetchTeamverDaemon',
    ).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { deleteProject } = await import('../../src/state/projects');

    await expect(deleteProject('project-1')).resolves.toBe(false);
    fetchDaemonSpy.mockRestore();
  });
});
