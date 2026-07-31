import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ExportJobStoreFullError,
  clearExportJobsForTests,
  completeExportJob,
  createExportJob,
  exportJobMaxEntries,
  exportJobTtlMs,
  failExportJob,
  isExportAsyncJobsEnabled,
  markExportJobRunning,
  resolveExportJob,
  subscribeExportJob,
} from '../src/export-job-store.js';

describe('export job store', () => {
  afterEach(() => {
    clearExportJobsForTests();
    delete process.env.OD_EXPORT_ASYNC_JOBS_ENABLED;
    delete process.env.OD_EXPORT_JOB_MAX_ENTRIES;
    delete process.env.OD_EXPORT_JOB_TTL_SEC;
  });

  it('keeps async export jobs behind an explicit feature flag', () => {
    expect(isExportAsyncJobsEnabled()).toBe(false);
    process.env.OD_EXPORT_ASYNC_JOBS_ENABLED = '1';
    expect(isExportAsyncJobsEnabled()).toBe(true);
  });

  it('clamps job ttl and max entry env values', () => {
    process.env.OD_EXPORT_JOB_TTL_SEC = '10';
    process.env.OD_EXPORT_JOB_MAX_ENTRIES = '2';
    expect(exportJobTtlMs()).toBe(60_000);
    expect(exportJobMaxEntries()).toBe(8);

    process.env.OD_EXPORT_JOB_TTL_SEC = '999999';
    process.env.OD_EXPORT_JOB_MAX_ENTRIES = '999999';
    expect(exportJobTtlMs()).toBe(86_400_000);
    expect(exportJobMaxEntries()).toBe(1024);
  });

  it('creates, resolves, and transitions export jobs by project', () => {
    const job = createExportJob({
      projectId: 'proj-1',
      format: 'pdf',
      now: 1_000,
    });

    expect(job.status).toBe('queued');
    expect(job.id).toMatch(/^[a-f0-9]{32}$/);
    expect(resolveExportJob('proj-2', job.id, 1_000)).toBeNull();

    const running = markExportJobRunning('proj-1', job.id, 2_000);
    expect(running).toMatchObject({
      id: job.id,
      status: 'running',
      startedAt: 2_000,
    });

    const ready = completeExportJob(
      'proj-1',
      job.id,
      {
        downloadUrl: '/api/projects/proj-1/export/downloads/token',
        filename: 'Deck.pdf',
        mime: 'application/pdf',
        bytes: 42,
        cache: 'miss',
      },
      3_000,
    );
    expect(ready).toMatchObject({
      id: job.id,
      status: 'ready',
      completedAt: 3_000,
      result: {
        filename: 'Deck.pdf',
        bytes: 42,
        cache: 'miss',
      },
    });
  });

  it('stores failed job diagnostics without leaking stale results', () => {
    const job = createExportJob({ projectId: 'proj-1', format: 'zip', now: 1_000 });
    completeExportJob(
      'proj-1',
      job.id,
      {
        downloadUrl: '/download',
        filename: 'Deck.zip',
        mime: 'application/zip',
        bytes: 1,
      },
      2_000,
    );

    const failed = failExportJob(
      'proj-1',
      job.id,
      { code: 'EXPORT_FAILED', message: 'render failed' },
      3_000,
    );

    expect(failed).toMatchObject({
      status: 'failed',
      error: { code: 'EXPORT_FAILED', message: 'render failed' },
    });
    expect(failed?.result).toBeUndefined();
  });

  it('notifies subscribers on job state transitions', () => {
    const job = createExportJob({ projectId: 'proj-1', format: 'pdf', now: 1_000 });
    const seen: string[] = [];
    const unsubscribe = subscribeExportJob('proj-1', job.id, (snapshot) => {
      seen.push(snapshot.status);
    });

    markExportJobRunning('proj-1', job.id, 2_000);
    completeExportJob(
      'proj-1',
      job.id,
      {
        downloadUrl: '/download',
        filename: 'Deck.pdf',
        mime: 'application/pdf',
        bytes: 1,
      },
      3_000,
    );
    unsubscribe();
    failExportJob('proj-1', job.id, { code: 'IGNORED', message: 'ignored' }, 4_000);

    expect(seen).toEqual(['running', 'ready']);
  });

  it('expires jobs after OD_EXPORT_JOB_TTL_SEC', () => {
    vi.useFakeTimers();
    process.env.OD_EXPORT_JOB_TTL_SEC = '60';
    try {
      vi.setSystemTime(1_000);
      const job = createExportJob({ projectId: 'proj-1', format: 'html' });
      expect(resolveExportJob('proj-1', job.id)).not.toBeNull();

      vi.setSystemTime(61_500);
      expect(resolveExportJob('proj-1', job.id)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects new jobs when the in-memory store is full', () => {
    process.env.OD_EXPORT_JOB_MAX_ENTRIES = '8';
    for (let i = 0; i < 8; i += 1) {
      createExportJob({ projectId: 'proj-1', format: 'image', now: 1_000 + i });
    }
    expect(() => createExportJob({ projectId: 'proj-1', format: 'image', now: 2_000 }))
      .toThrow(ExportJobStoreFullError);
  });
});
