// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

describe('TeamverBackgroundRunsBanner', () => {
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
});
