import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ExportQueueFullError,
  bindExportBrowserLauncher,
  exportMaxConcurrent,
  exportQueueMax,
  exportRuntimeStatsForTests,
  resetExportRuntimeForTests,
  runHeadlessExportJob,
} from '../src/export-runtime.js';

type MockBrowser = {
  newPage: () => Promise<unknown>;
  close: () => Promise<void>;
  isConnected: () => boolean;
};

function mockBrowser(): MockBrowser {
  return {
    newPage: async () => ({}),
    close: async () => {},
    isConnected: () => true,
  };
}

async function flushMicrotasks(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

describe('export runtime', () => {
  beforeEach(() => {
    bindExportBrowserLauncher(async () => mockBrowser());
  });

  afterEach(async () => {
    await resetExportRuntimeForTests();
    delete process.env.OD_EXPORT_MAX_CONCURRENT;
    delete process.env.OD_EXPORT_QUEUE_MAX;
    delete process.env.OD_EXPORT_BROWSER_POOL_SIZE;
  });

  it('runs jobs up to OD_EXPORT_MAX_CONCURRENT in parallel', async () => {
    process.env.OD_EXPORT_MAX_CONCURRENT = '2';
    process.env.OD_EXPORT_BROWSER_POOL_SIZE = '2';

    let active = 0;
    let maxActive = 0;
    let releaseWork!: () => void;
    const blockWork = new Promise<void>((resolve) => {
      releaseWork = resolve;
    });

    const jobs = [
      runHeadlessExportJob({ format: 'pdf', deck: false }, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await blockWork;
        active -= 1;
        return Buffer.from('a');
      }),
      runHeadlessExportJob({ format: 'pdf', deck: false }, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await blockWork;
        active -= 1;
        return Buffer.from('b');
      }),
    ];

    await flushMicrotasks();
    expect(maxActive).toBe(2);
    releaseWork();
    const results = await Promise.all(jobs);
    expect(results.map((buf) => buf.toString())).toEqual(['a', 'b']);
  });

  it('throws ExportQueueFullError when the wait queue exceeds OD_EXPORT_QUEUE_MAX', async () => {
    process.env.OD_EXPORT_MAX_CONCURRENT = '1';
    process.env.OD_EXPORT_QUEUE_MAX = '4';

    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runHeadlessExportJob({ format: 'html', deck: false }, async () => {
      await gate;
      return 'done';
    });
    await flushMicrotasks();

    const waiters = Array.from({ length: 4 }, (_, index) =>
      runHeadlessExportJob({ format: 'html', deck: false }, async () => `waiter-${index}`),
    );
    await flushMicrotasks();
    expect(exportRuntimeStatsForTests().pending).toBe(4);

    await expect(
      runHeadlessExportJob({ format: 'html', deck: false }, async () => 'overflow'),
    ).rejects.toBeInstanceOf(ExportQueueFullError);

    releaseFirst();
    await expect(first).resolves.toBe('done');
    await expect(Promise.all(waiters)).resolves.toEqual(['waiter-0', 'waiter-1', 'waiter-2', 'waiter-3']);
  });

  it('reads export env defaults', () => {
    delete process.env.OD_EXPORT_MAX_CONCURRENT;
    delete process.env.OD_EXPORT_QUEUE_MAX;
    expect(exportMaxConcurrent()).toBeGreaterThanOrEqual(1);
    expect(exportQueueMax()).toBeGreaterThanOrEqual(4);
  });
});
