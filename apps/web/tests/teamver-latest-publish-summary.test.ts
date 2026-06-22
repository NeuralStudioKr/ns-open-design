import { beforeEach, describe, expect, it, vi } from 'vitest';

const listOutputsMock = vi.fn();

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDriveAssetUrl: vi.fn((id: string) => `https://drive.example/a/${id}`),
}));

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => ({
    http: { get: listOutputsMock },
    workspaceStore: { get: vi.fn(async () => 'ws-1') },
  })),
}));

import {
  clearLatestPublishSummaryCache,
  fetchLatestPublishSummary,
} from '../src/teamver/latestPublishSummary';

describe('fetchLatestPublishSummary', () => {
  beforeEach(() => {
    listOutputsMock.mockReset();
    clearLatestPublishSummaryCache();
  });

  it('returns latest ready publish with version label', async () => {
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
        {
          id: 'o-old',
          kind: 'html',
          driveAssetId: 'AST-OLD',
          driveFolderId: 'F1',
          driveSharedDriveId: 'SD1',
          filename: 'old.html',
          publishStatus: 'ready',
          publishedAt: '2026-01-01T00:00:00Z',
          sizeBytes: 10,
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
  });
});
