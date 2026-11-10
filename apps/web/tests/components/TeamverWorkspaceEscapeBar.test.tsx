// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeamverWorkspaceEscapeBar } from '../../src/components/TeamverWorkspaceEscapeBar';
import { I18nProvider } from '../../src/i18n';

describe('TeamverWorkspaceEscapeBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps Slide home in-app and hides the Teamver app header link', () => {
    const onDesignHome = vi.fn();
    render(
      <I18nProvider initial="ko">
        <TeamverWorkspaceEscapeBar onDesignHome={onDesignHome} />
      </I18nProvider>,
    );

    const designHome = screen.getByTestId('teamver-embed-design-home');
    expect(designHome.tagName).toBe('BUTTON');
    expect(designHome.textContent).toContain('슬라이드 홈');

    fireEvent.click(designHome);
    expect(onDesignHome).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId('teamver-embed-teamver-app')).toBeNull();
    expect(screen.queryByText('Teamver 앱')).toBeNull();
  });
});
