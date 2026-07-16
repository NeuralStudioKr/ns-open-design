import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalFileExportCacheStore } from '../src/export-cache-local.js';
import { MemoExportCacheStore } from '../src/export-cache-memo.js';
import {
  exportCacheDescriptor,
  resetExportCacheForTests,
  runCachedExport,
  setExportCacheStoresForTests,
} from '../src/export-cache-runtime.js';

describe('runCachedExport (memo only)', () => {
  let memo: MemoExportCacheStore;

  beforeEach(async () => {
    memo = new MemoExportCacheStore();
    setExportCacheStoresForTests([memo]);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await resetExportCacheForTests();
    vi.restoreAllMocks();
    delete process.env.OD_EXPORT_CACHE_ENABLED;
    delete process.env.OD_EXPORT_CACHE_MEMO_ENABLED;
  });

  const baseDescriptor = () =>
    exportCacheDescriptor({
      projectId: 'proj-a',
      sourceRelPath: 'index.html',
      sourceMtimeMs: 42,
      format: 'html',
      deck: false,
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    });

  it('renders once on first miss and populates the memo store', async () => {
    const render = vi.fn(async () => ({
      body: Buffer.from('<html>fresh</html>'),
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    }));

    const outcome = await runCachedExport(
      { format: 'html', deck: false, projectId: 'proj-a' },
      baseDescriptor(),
      render,
    );

    expect(outcome.cache).toBe('miss');
    expect(render).toHaveBeenCalledTimes(1);
    expect(memo.metrics().entries).toBe(1);
    expect(memo.metrics().totalBytes).toBeGreaterThan(0);
    expect(Buffer.isBuffer(outcome.body)).toBe(true);
  });

  it('returns hit-memo on a second identical request without invoking render', async () => {
    const render = vi.fn(async () => ({
      body: Buffer.from('<html>fresh</html>'),
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    }));

    await runCachedExport(
      { format: 'html', deck: false, projectId: 'proj-a' },
      baseDescriptor(),
      render,
    );
    const second = await runCachedExport(
      { format: 'html', deck: false, projectId: 'proj-a' },
      baseDescriptor(),
      render,
    );

    expect(render).toHaveBeenCalledTimes(1);
    expect(second.cache).toBe('hit-memo');
    if (second.cache === 'hit-memo') {
      expect(second.bytes).toBeGreaterThan(0);
      expect(second.ageMs).not.toBeNull();
      expect(second.ageMs!).toBeGreaterThanOrEqual(0);
    }
    // Same bytes as the first call.
    expect(second.body.toString('utf8')).toBe('<html>fresh</html>');
  });

  it('fresh=true bypasses the memo cache and re-renders', async () => {
    let renderCount = 0;
    const render = vi.fn(async () => {
      renderCount += 1;
      return {
        body: Buffer.from(`<html>v${renderCount}</html>`),
        filename: 'artifact.html',
        mime: 'text/html; charset=utf-8',
      };
    });

    const first = await runCachedExport(
      { format: 'html', deck: false, projectId: 'proj-a' },
      baseDescriptor(),
      render,
    );
    expect(first.cache).toBe('miss');
    expect(first.body.toString('utf8')).toBe('<html>v1</html>');

    // Normal follow-up hits the cache.
    const cached = await runCachedExport(
      { format: 'html', deck: false, projectId: 'proj-a' },
      baseDescriptor(),
      render,
    );
    expect(cached.cache).toBe('hit-memo');
    expect(render).toHaveBeenCalledTimes(1);

    // fresh=true forces a re-render and refreshes the cache.
    const forced = await runCachedExport(
      { format: 'html', deck: false, projectId: 'proj-a' },
      baseDescriptor(),
      render,
      { fresh: true },
    );
    expect(forced.cache).toBe('miss');
    expect(forced.body.toString('utf8')).toBe('<html>v2</html>');
    expect(render).toHaveBeenCalledTimes(2);

    // Next non-fresh call sees the new bytes.
    const afterForced = await runCachedExport(
      { format: 'html', deck: false, projectId: 'proj-a' },
      baseDescriptor(),
      render,
    );
    expect(afterForced.cache).toBe('hit-memo');
    expect(afterForced.body.toString('utf8')).toBe('<html>v2</html>');
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('separates cache entries by format (HTML vs PDF vs ZIP) for the same source', async () => {
    const render = vi.fn(async () => ({
      body: Buffer.from('payload'),
      filename: 'artifact',
      mime: 'application/octet-stream',
    }));

    for (const format of ['html', 'pdf', 'zip'] as const) {
      await runCachedExport(
        { format: format === 'zip' ? 'zip' : format === 'pdf' ? 'pdf' : 'html', deck: false, projectId: 'proj-a' },
        exportCacheDescriptor({
          projectId: 'proj-a',
          sourceRelPath: 'index.html',
          sourceMtimeMs: 42,
          format,
          deck: false,
          filename: `x.${format}`,
          mime: 'application/octet-stream',
        }),
        render,
      );
    }

    expect(render).toHaveBeenCalledTimes(3);
    expect(memo.metrics().entries).toBe(3);
  });

  it('separates cache entries by image slideIndex (deck slide-flip cache)', async () => {
    const render = vi.fn(async () => ({
      body: Buffer.from('png-bytes'),
      filename: 'x.png',
      mime: 'image/png',
    }));

    for (const slide of [0, 1, 2]) {
      await runCachedExport(
        { format: 'image', deck: true, projectId: 'proj-a' },
        exportCacheDescriptor({
          projectId: 'proj-a',
          sourceRelPath: 'index.html',
          sourceMtimeMs: 42,
          format: 'png',
          deck: true,
          slideIndex: slide,
          filename: `slide-${slide}.png`,
          mime: 'image/png',
        }),
        render,
      );
    }

    expect(render).toHaveBeenCalledTimes(3);
    expect(memo.metrics().entries).toBe(3);
  });

  it('busts the cache when sourceMtimeMs changes (source edited)', async () => {
    const render = vi.fn(async () => ({
      body: Buffer.from('bytes-v1'),
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    }));

    const meta = { format: 'html', deck: false, projectId: 'proj-a' } as const;
    await runCachedExport(meta, baseDescriptor(), render);
    // Same call is a cache hit.
    await runCachedExport(meta, baseDescriptor(), render);
    // Source file changed on disk → daemon computes a new mtime → miss.
    await runCachedExport(
      meta,
      exportCacheDescriptor({
        projectId: 'proj-a',
        sourceRelPath: 'index.html',
        sourceMtimeMs: 999,
        format: 'html',
        deck: false,
        filename: 'artifact.html',
        mime: 'text/html; charset=utf-8',
      }),
      render,
    );

    expect(render).toHaveBeenCalledTimes(2);
  });

  it('busts the cache when a route pins a different codeVersion', async () => {
    const render = vi.fn(async () => ({
      body: Buffer.from(`pptx-v${render.mock.calls.length + 1}`),
      filename: 'artifact.pptx',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }));
    const meta = { format: 'pptx', deck: true, projectId: 'proj-a' } as const;
    const descriptor = (codeVersion: string) =>
      exportCacheDescriptor({
        projectId: 'proj-a',
        sourceRelPath: 'index.html',
        sourceMtimeMs: 42,
        format: 'pptx',
        deck: true,
        codeVersion,
        filename: 'artifact.pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });

    await runCachedExport(meta, descriptor('pptx-ooxml-v1'), render);
    await runCachedExport(meta, descriptor('pptx-ooxml-v1'), render);
    await runCachedExport(meta, descriptor('pptx-ooxml-v2'), render);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it('bypasses cache when OD_EXPORT_CACHE_ENABLED=0', async () => {
    process.env.OD_EXPORT_CACHE_ENABLED = '0';
    const render = vi.fn(async () => ({
      body: Buffer.from('always-fresh'),
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    }));

    const meta = { format: 'html', deck: false, projectId: 'proj-a' } as const;
    await runCachedExport(meta, baseDescriptor(), render);
    const second = await runCachedExport(meta, baseDescriptor(), render);

    expect(render).toHaveBeenCalledTimes(2);
    expect(second.cache).toBe('miss');
    expect(memo.metrics().entries).toBe(0);
  });

  it('separates cache entries by projectId (tenant isolation)', async () => {
    const render = vi.fn(async () => ({
      body: Buffer.from('payload'),
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    }));

    const projectA = exportCacheDescriptor({
      projectId: 'proj-a',
      sourceRelPath: 'index.html',
      sourceMtimeMs: 42,
      format: 'html',
      deck: false,
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    });
    const projectB = exportCacheDescriptor({
      projectId: 'proj-b',
      sourceRelPath: 'index.html',
      sourceMtimeMs: 42,
      format: 'html',
      deck: false,
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    });

    await runCachedExport({ format: 'html', deck: false, projectId: 'proj-a' }, projectA, render);
    await runCachedExport({ format: 'html', deck: false, projectId: 'proj-b' }, projectB, render);
    // A second call to project A is a hit; a first call to B was still a miss.
    await runCachedExport({ format: 'html', deck: false, projectId: 'proj-a' }, projectA, render);

    expect(render).toHaveBeenCalledTimes(2);
    expect(memo.metrics().entries).toBe(2);
  });

  describe('memo + local chain', () => {
    let memo2: MemoExportCacheStore;
    let local2: LocalFileExportCacheStore;
    let cacheDir = '';

    beforeEach(() => {
      cacheDir = mkdtempSync(path.join(tmpdir(), 'od-export-chain-'));
      memo2 = new MemoExportCacheStore();
      local2 = new LocalFileExportCacheStore(cacheDir);
      setExportCacheStoresForTests([memo2, local2]);
    });

    afterEach(async () => {
      await local2.clearForTests();
      if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
    });

    it('writes to both layers on miss; hits memo first on second call', async () => {
      const render = vi.fn(async () => ({
        body: Buffer.from('chain-payload'),
        filename: 'artifact.pdf',
        mime: 'application/pdf',
      }));

      const descriptor = exportCacheDescriptor({
        projectId: 'proj-a',
        sourceRelPath: 'index.html',
        sourceMtimeMs: 99,
        format: 'pdf',
        deck: false,
        filename: 'artifact.pdf',
        mime: 'application/pdf',
      });
      const meta = { format: 'pdf', deck: false, projectId: 'proj-a' } as const;

      await runCachedExport(meta, descriptor, render);
      const hit = await runCachedExport(meta, descriptor, render);

      expect(render).toHaveBeenCalledTimes(1);
      expect(hit.cache).toBe('hit-memo');
      const localMetrics = await local2.collectMetrics();
      expect(localMetrics.entries).toBe(1);
      expect(memo2.metrics().entries).toBe(1);
    });

    it('falls back to hit-local when memo is invalidated (survives daemon RAM eviction)', async () => {
      const render = vi.fn(async () => ({
        body: Buffer.from('durable'),
        filename: 'artifact.pdf',
        mime: 'application/pdf',
      }));

      const descriptor = exportCacheDescriptor({
        projectId: 'proj-a',
        sourceRelPath: 'index.html',
        sourceMtimeMs: 99,
        format: 'pdf',
        deck: false,
        filename: 'artifact.pdf',
        mime: 'application/pdf',
      });
      const meta = { format: 'pdf', deck: false, projectId: 'proj-a' } as const;

      const first = await runCachedExport(meta, descriptor, render);
      // Simulate memo eviction (LRU, restart, etc.) — local should still serve.
      await memo2.clearForTests();
      const hit = await runCachedExport(meta, descriptor, render);

      expect(render).toHaveBeenCalledTimes(1);
      expect(first.cache).toBe('miss');
      expect(hit.cache).toBe('hit-local');
      if (hit.cache === 'hit-local') {
        expect(hit.filePath).toBeTruthy();
      }
    });
  });

  it('emits od_export_done with cache=hit-memo on hits (metrics for CloudWatch)', async () => {
    const render = vi.fn(async () => ({
      body: Buffer.from('fresh'),
      filename: 'artifact.html',
      mime: 'text/html; charset=utf-8',
    }));

    const meta = { format: 'html', deck: false, projectId: 'proj-a' } as const;
    // First call is a miss — production emits its metric from
    // runHeadlessExportJob inside renderHeadless*, but this unit test uses a
    // fake `render` that bypasses that pipeline. So we only assert on the
    // hit-emitted-by-runCachedExport metric.
    await runCachedExport(meta, baseDescriptor(), render);
    await runCachedExport(meta, baseDescriptor(), render);

    const infoCalls = (console.info as ReturnType<typeof vi.fn>).mock.calls;
    const parsed = infoCalls
      .map((args) => {
        try {
          return JSON.parse(String(args[0]));
        } catch {
          return null;
        }
      })
      .filter(
        (v): v is { marker: string; cache?: string; cacheKey?: string; ok?: boolean } =>
          v && v.marker === 'od_export_done',
      );

    const hitEvents = parsed.filter((e) => e.cache === 'hit-memo');
    expect(hitEvents.length).toBeGreaterThanOrEqual(1);
    expect(hitEvents[0]!.cacheKey).toMatch(/^[a-f0-9]{12}$/);
  });
});
