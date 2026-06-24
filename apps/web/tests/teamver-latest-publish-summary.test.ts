import { beforeEach, describe, expect, it, vi } from 'vitest';

const batchPostMock = vi.fn();
const listOutputsMock = vi.fn();
const isEmbedMock = vi.fn(() => true);

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: () => isEmbedMock(),
  resolveTeamverDriveAssetUrl: vi.fn((id: string) => `https://drive.example/a/${id}`),
}));

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => ({
    http: {
      get: listOutputsMock,
      post: batchPostMock,
    },
    workspaceStore: { get: vi.fn(async () => 'ws-1') },
  })),
}));

vi.mock('../src/teamver/listProjectOutputs', () => ({
  listTeamverProjectOutputs: (...args: unknown[]) => listOutputsMock(...args),
}));

import {
  clearLatestPublishSummaryCache,
  fetchLatestPublishSummary,
  prefetchLatestPublishSummaries,
} from '../src/teamver/latestPublishSummary';

describe('fetchLatestPublishSummary', () => {
  beforeEach(() => {
    batchPostMock.mockReset();
    listOutputsMock.mockReset();
    isEmbedMock.mockReturnValue(true);
    clearLatestPublishSummaryCache();
  });

  it('uses batch API in embed mode and returns latest ready publish', async () => {
    batchPostMock.mockResolvedValue({
      summaries: [
        {
          odProjectId: 'p1',
          version: 2,
          kind: 'pdf',
          driveAssetId: 'AST-NEW',
          filename: 'deck.pdf',
        },
      ],
    });

    const summary = await fetchLatestPublishSummary('p1');
    expect(summary).toEqual({
      projectId: 'p1',
      version: 2,
      kind: 'pdf',
      driveUrl: 'https://drive.example/a/AST-NEW',
      filename: 'deck.pdf',
    });
    expect(batchPostMock).toHaveBeenCalledWith(
      '/projects/batch/outputs/latest',
      { odProjectIds: ['p1'] },
      { workspaceId: 'ws-1', skipAuthHeader: true },
    );
    expect(listOutputsMock).not.toHaveBeenCalled();
  });

  it('prefetchLatestPublishSummaries coalesces ids into one batch call', async () => {
    batchPostMock.mockResolvedValue({
      summaries: [
        {
          odProjectId: 'p1',
          version: 1,
          kind: 'html',
          driveAssetId: 'AST-1',
          filename: 'a.html',
        },
        {
          odProjectId: 'p2',
          version: 3,
          kind: 'zip',
          driveAssetId: 'AST-2',
          filename: 'b.zip',
        },
      ],
    });

    await prefetchLatestPublishSummaries(['p1', 'p2']);
    expect(batchPostMock).toHaveBeenCalledTimes(1);
    expect(batchPostMock.mock.calls[0]?.[1]).toEqual({ odProjectIds: ['p1', 'p2'] });

    batchPostMock.mockClear();
    const second = await fetchLatestPublishSummary('p2');
    expect(second?.filename).toBe('b.zip');
    expect(batchPostMock).not.toHaveBeenCalled();
  });

  it('falls back to per-project outputs when batch HTTP fails', async () => {
    batchPostMock.mockRejectedValue(new Error('502'));
    listOutputsMock.mockResolvedValue({
      projectId: 'p1',
      outputs: [
        {
          id: 'o-new',
          kind: 'html',
          driveAssetId: 'AST-NEW',
          driveFolderId: 'F1',
          driveSharedDriveId: 'SD1',
          filename: 'deck.html',
          publishStatus: 'ready',
          publishedAt: '2026-02-01T00:00:00Z',
          sizeBytes: 20,
        },
      ],
    });

    const summary = await fetchLatestPublishSummary('p1');
    expect(summary?.driveUrl).toBe('https://drive.example/a/AST-NEW');
    expect(listOutputsMock).toHaveBeenCalledWith('p1');
  });

  it('falls back to per-project outputs outside embed mode', async () => {
    isEmbedMock.mockReturnValue(false);
    listOutputsMock.mockResolvedValue({
      projectId: 'p1',
      outputs: [
        {
          id: 'o-new',
          kind: 'pdf',
          driveAssetId: 'AST-NEW',
          driveFolderId: 'F1',
          driveSharedDriveId: 'SD1',
          filename: 'deck.pdf',
          publishStatus: 'ready',
          publishedAt: '2026-02-01T00:00:00Z',
          sizeBytes: 20,
        },
      ],
    });

    const summary = await fetchLatestPublishSummary('p1');
    expect(summary?.kind).toBe('pdf');
    expect(batchPostMock).not.toHaveBeenCalled();
    expect(listOutputsMock).toHaveBeenCalledWith('p1');
  });

  it('keeps batched fetch when per-project clear runs alongside an in-flight drain', async () => {
    let resolveBatch: ((value: unknown) => void) | null = null;
    batchPostMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
    );

    const inflight = fetchLatestPublishSummary('p1');
    await new Promise((r) => setTimeout(r, 0));
    expect(typeof resolveBatch).toBe('function');

    clearLatestPublishSummaryCache('p1');
    clearLatestPublishSummaryCache('p2');
    clearLatestPublishSummaryCache('p3');

    resolveBatch!({
      summaries: [
        {
          odProjectId: 'p1',
          version: 4,
          kind: 'html',
          driveAssetId: 'AST-LIVE',
          filename: 'deck.html',
        },
      ],
    });

    const summary = await inflight;
    expect(summary?.driveUrl).toBe('https://drive.example/a/AST-LIVE');
    expect(batchPostMock).toHaveBeenCalledTimes(1);
    expect(listOutputsMock).not.toHaveBeenCalled();
  });
});
