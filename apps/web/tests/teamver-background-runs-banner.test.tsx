// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeamverBackgroundRunsBanner } from '../src/teamver/components/TeamverBackgroundRunsBanner';

vi.mock('../src/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => {
    if (key === 'teamver.backgroundRuns.titleMany') return `${vars?.n} projects running`;
    if (key === 'teamver.backgroundRuns.andMore') return `+${vars?.n} more`;
    if (key === 'teamver.backgroundRuns.running') return 'Running';
    if (key === 'teamver.backgroundRuns.queued') return 'Queued';
    if (key === 'teamver.backgroundRuns.open') return 'Open';
    if (key === 'teamver.backgroundRuns.titleOne') return 'Running in the background';
    return key;
  },
}));

afterEach(() => {
  cleanup();
});

describe('TeamverBackgroundRunsBanner', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens the primary project when clicked', () => {
    const onOpenProject = vi.fn();
    render(
      <TeamverBackgroundRunsBanner
        summaries={[
          {
            projectId: 'p1',
            projectName: 'Deck A',
            status: 'running',
            count: 1,
            conversationId: 'conv-a',
            previewFileName: 'deck.html',
          },
          { projectId: 'p2', projectName: 'Deck B', status: 'queued', count: 1 },
        ]}
        onOpenProject={onOpenProject}
      />,
    );

    expect(screen.getByTestId('teamver-background-runs-banner')).toBeTruthy();
    fireEvent.click(screen.getByTestId('teamver-background-runs-open'));
    expect(onOpenProject).toHaveBeenCalledWith('p1', {
      conversationId: 'conv-a',
      fileName: 'deck.html',
    });
  });

  it('collapses expanded list when the primary project changes', () => {
    const onOpenProject = vi.fn();
    const { rerender, container } = render(
      <TeamverBackgroundRunsBanner
        summaries={[
          { projectId: 'p1', projectName: 'Deck A', status: 'running', count: 1 },
          { projectId: 'p2', projectName: 'Deck B', status: 'queued', count: 1 },
        ]}
        onOpenProject={onOpenProject}
      />,
    );

    const view = within(container);
    fireEvent.click(view.getByRole('button', { name: '2 projects running' }));
    expect(view.getByRole('list')).toBeTruthy();

    rerender(
      <TeamverBackgroundRunsBanner
        summaries={[
          { projectId: 'p3', projectName: 'Deck C', status: 'running', count: 1 },
          { projectId: 'p2', projectName: 'Deck B', status: 'queued', count: 1 },
        ]}
        onOpenProject={onOpenProject}
      />,
    );

    expect(view.queryByRole('list')).toBeNull();
  });

  it('collapses expanded list when the primary preview file changes', () => {
    const onOpenProject = vi.fn();
    const { rerender, container } = render(
      <TeamverBackgroundRunsBanner
        summaries={[
          {
            projectId: 'p1',
            projectName: 'Deck A',
            status: 'running',
            count: 1,
            previewFileName: 'v1.html',
          },
          { projectId: 'p2', projectName: 'Deck B', status: 'queued', count: 1 },
        ]}
        onOpenProject={onOpenProject}
      />,
    );

    const view = within(container);
    fireEvent.click(view.getByRole('button', { name: '2 projects running' }));
    expect(view.getByRole('list')).toBeTruthy();

    rerender(
      <TeamverBackgroundRunsBanner
        summaries={[
          {
            projectId: 'p1',
            projectName: 'Deck A',
            status: 'running',
            count: 1,
            previewFileName: 'v2.html',
          },
          { projectId: 'p2', projectName: 'Deck B', status: 'queued', count: 1 },
        ]}
        onOpenProject={onOpenProject}
      />,
    );

    expect(view.queryByRole('list')).toBeNull();
  });
});
