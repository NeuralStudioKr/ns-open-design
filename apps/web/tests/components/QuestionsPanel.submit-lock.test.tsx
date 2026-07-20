// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuestionForm } from '../../src/artifacts/question-form';
import { QuestionsPanel } from '../../src/components/QuestionsPanel';

const form: QuestionForm = {
  id: 'discovery',
  title: 'A few quick questions',
  questions: [
    { id: 'q1', label: 'What is it about?', type: 'text' },
    { id: 'q2', label: 'Who is the audience?', type: 'text' },
  ],
};

function revealAll() {
  for (let i = 0; i < form.questions.length; i += 1) {
    act(() => {
      vi.advanceTimersByTime(280);
    });
  }
}

function continueButton(): HTMLButtonElement {
  const btn = document.querySelector<HTMLButtonElement>('.questions-continue');
  if (!btn) throw new Error('expected a Continue button');
  return btn;
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe('QuestionsPanel submit lock', () => {
  it('fires onSubmit once even when Continue is clicked repeatedly', () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    act(() => {
      render(
        <QuestionsPanel
          form={form}
          formKey="conv-1:msg-a:discovery"
          interactive
          generating={false}
          onSubmit={onSubmit}
        />,
      );
    });
    revealAll();

    const button = continueButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled loading state on the Continue button after it is clicked', () => {
    vi.useFakeTimers();
    act(() => {
      render(
        <QuestionsPanel
          form={form}
          formKey="conv-1:msg-b:discovery"
          interactive
          generating={false}
          onSubmit={() => {}}
        />,
      );
    });
    revealAll();

    expect(continueButton().disabled).toBe(false);

    act(() => {
      fireEvent.click(continueButton());
    });

    expect(continueButton().disabled).toBe(true);
    expect(continueButton().getAttribute('aria-busy')).toBe('true');
  });

  it('hands the lock off to submitDisabled once the turn is busy', () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    const props = {
      form,
      formKey: 'conv-1:msg-c:discovery',
      interactive: true,
      generating: false,
      onSubmit,
    } as const;
    const { rerender } = render(<QuestionsPanel {...props} />);
    revealAll();

    act(() => {
      fireEvent.click(continueButton());
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(continueButton().disabled).toBe(true);

    act(() => {
      rerender(<QuestionsPanel {...props} submitDisabled />);
    });
    expect(continueButton().disabled).toBe(true);
  });
});
