// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeamverWorkspaceEscapeBar } from '../../src/components/TeamverWorkspaceEscapeBar';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/teamver/designApiBase', () => ({
  resolveTeamverMainOrigin: () => 'https://teamver.com',
}));

describe('TeamverWorkspaceEscapeBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('separates Design home (in-app) from Teamver app (external link)', () => {
    const onDesignHome = vi.fn();
    render(
      <I18nProvider initial="ko">
        <TeamverWorkspaceEscapeBar onDesignHome={onDesignHome} />
      </I18nProvider>,
    );

    const designHome = screen.getByTestId('teamver-embed-design-home');
    expect(designHome.tagName).toBe('BUTTON');
    expect(designHome.textContent).toContain('Design 홈');

    fireEvent.click(designHome);
    expect(onDesignHome).toHaveBeenCalledTimes(1);

    const teamverApp = screen.getByTestId('teamver-embed-teamver-app');
    expect(teamverApp.tagName).toBe('A');
    expect(teamverApp.getAttribute('href')).toBe('https://teamver.com');
    expect(teamverApp.textContent).toContain('Teamver 앱');
  });
});
