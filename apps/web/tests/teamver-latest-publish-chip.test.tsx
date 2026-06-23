// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSummaryMock = vi.fn();

class MockIntersectionObserver {
  static last: MockIntersectionObserver | null = null;

  constructor(private readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.last = this;
  }

  observe() {}

  disconnect() {}

  triggerVisible() {
    const entry = { isIntersecting: true } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

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
    MockIntersectionObserver.last = null;
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('defers fetch until visible when deferUntilVisible is set', async () => {
    fetchSummaryMock.mockResolvedValue({
      projectId: 'p-defer',
      version: 1,
      kind: 'html',
      driveUrl: 'https://drive.example/a/1',
      filename: 'Deck.html',
    });

    render(<TeamverLatestPublishChip projectId="p-defer" deferUntilVisible />);
    expect(fetchSummaryMock).not.toHaveBeenCalled();

    MockIntersectionObserver.last?.triggerVisible();

    await screen.findByTestId('teamver-publish-chip-p-defer');
    expect(fetchSummaryMock).toHaveBeenCalledWith('p-defer');
  });
});
