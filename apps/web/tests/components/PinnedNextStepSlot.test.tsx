// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PinnedNextStepSlot } from '../../src/components/PinnedNextStepSlot';
import { en } from '../../src/i18n/locales/en';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('PinnedNextStepSlot', () => {
  it('renders featured toolbox actions above the composer context', () => {
    const onToolboxAction = vi.fn();
    render(
      <PinnedNextStepSlot
        artifactName="deck.html"
        onToolboxAction={onToolboxAction}
      />,
    );
    expect(screen.getByTestId('chat-pinned-next-step')).toBeTruthy();
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    expect(screen.getByText(en['chat.designToolbox.action.auto-match.title'])).toBeTruthy();
    fireEvent.click(screen.getByTestId('next-step-toolbox-action-visual-polish'));
    expect(onToolboxAction).toHaveBeenCalledWith('visual-polish');
  });

  it('routes Share through the More → Share cascade with the file name', () => {
    const onShare = vi.fn();
    render(
      <PinnedNextStepSlot
        artifactName="landing.html"
        onShare={onShare}
        onToolboxAction={vi.fn()}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-share'));
    expect(onShare).toHaveBeenCalledWith('landing.html');
  });

  it('reaches Contribute through the More → Share cascade', () => {
    const onShareToOpenDesign = vi.fn();
    render(
      <PinnedNextStepSlot
        artifactName="landing.html"
        onToolboxAction={vi.fn()}
        onShareToOpenDesign={onShareToOpenDesign}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-contribute'));
    expect(onShareToOpenDesign).toHaveBeenCalledTimes(1);
  });
});
