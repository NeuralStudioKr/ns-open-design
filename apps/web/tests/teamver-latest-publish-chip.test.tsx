// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSummaryMock = vi.fn();

vi.mock('../src/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => {
    if (key === 'teamver.publish.chipLabel') return `Drive v${vars?.version}`;
    if (key === 'teamver.publish.chipTitle') return `title v${vars?.version}`;
    return key;
  },
}));

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock('../src/teamver/latestPublishSummary', () => ({
  fetchLatestPublishSummary: (...args: unknown[]) => fetchSummaryMock(...args),
  clearLatestPublishSummaryCache: vi.fn(),
}));

import { TeamverLatestPublishChip } from '../src/teamver/components/TeamverLatestPublishChip';

describe('TeamverLatestPublishChip', () => {
  beforeEach(() => {
    fetchSummaryMock.mockReset();
  });

  it('renders Drive version link when a ready publish exists', async () => {
    fetchSummaryMock.mockResolvedValue({
      projectId: 'p1',
      version: 3,
      kind: 'html',
      driveUrl: 'https://drive.example/a/1',
      filename: 'Deck.html',
    });

    render(<TeamverLatestPublishChip projectId="p1" />);

    const link = await screen.findByTestId('teamver-publish-chip-p1');
    expect(link.getAttribute('href')).toBe('https://drive.example/a/1');
    expect(link.textContent).toContain('Drive v3');
  });

  it('renders nothing when no publish summary exists', async () => {
    fetchSummaryMock.mockResolvedValue(null);
    render(<TeamverLatestPublishChip projectId="p-empty" />);
    await waitFor(() => {
      expect(screen.queryByTestId('teamver-publish-chip-p-empty')).toBeNull();
    });
  });
});
