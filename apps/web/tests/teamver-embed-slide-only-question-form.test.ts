import { describe, expect, it } from 'vitest';

import type { FormOption, QuestionForm } from '../src/artifacts/question-form';
import {
  questionFormForSlideOnlyDisplay,
  sanitizeQuestionFormForSlideOnlyEmbed,
} from '../src/teamver/branding/embedSlideOnlyQuestionForm';

function opt(label: string): FormOption {
  return { label, value: label };
}

const DISCOVERY_FORM: QuestionForm = {
  id: 'discovery',
  title: '간단한 정보 확인 — 30초',
  questions: [
    {
      id: 'output',
      label: '어떤 형태로 만들까요?',
      type: 'radio',
      required: true,
      options: [
        opt('슬라이드 덱 / 발표자료'),
        opt('단일 웹 프로토타입 / 랜딩'),
        opt('멀티스크린 앱 프로토타입'),
        opt('대시보드 / 툴 UI'),
        opt('에디토리얼 / 마케팅 페이지'),
        opt('기타 — 직접 설명'),
      ],
    },
    {
      id: 'platform',
      label: '대상 플랫폼',
      type: 'checkbox',
      maxSelections: 4,
      options: [
        opt('반응형 웹'),
        opt('데스크톱 웹'),
        opt('iOS 앱'),
        opt('Android 앱'),
        opt('Fixed canvas (16:9, 1920×1080)'),
        opt('Web viewer (responsive)'),
      ],
    },
    {
      id: 'audience',
      label: '대상 독자',
      type: 'text',
      placeholder: '예: 초기 투자자',
    },
  ],
};

describe('embedSlideOnlyQuestionForm', () => {
  it('passes forms through unchanged when slide-only gate is off', () => {
    expect(
      questionFormForSlideOnlyDisplay(DISCOVERY_FORM, { slideOnlyMvp: false, enabled: false }),
    ).toBe(DISCOVERY_FORM);
  });

  it('drops "무엇을 만들까요?" even when question id is not taskType/output', () => {
    const form: QuestionForm = {
      id: 'task-type',
      title: 'Brief',
      questions: [
        {
          id: 'custom_build',
          label: '무엇을 만들까요?',
          type: 'radio',
          options: [opt('Slide deck'), opt('Prototype'), opt('Image')],
        },
        { id: 'audience', label: 'Audience', type: 'text' },
      ],
    };
    const sanitized = sanitizeQuestionFormForSlideOnlyEmbed(form);
    expect(sanitized?.questions.map((q) => q.id)).toEqual(['audience']);
  });

  it('drops single-option slide routing question by label (deck is fixed)', () => {
    const form: QuestionForm = {
      id: 'discovery',
      title: 'Brief',
      questions: [
        {
          id: 'q1',
          label: 'What should I build?',
          type: 'radio',
          options: [opt('Slide deck / pitch')],
        },
        { id: 'scale', label: 'Slide count', type: 'text' },
      ],
    };
    const sanitized = sanitizeQuestionFormForSlideOnlyEmbed(form);
    expect(sanitized?.questions.map((q) => q.id)).toEqual(['scale']);
  });

  it('applies slide-only gate when embed enabled even if slideOnlyMvp flag is false', () => {
    const sanitized = questionFormForSlideOnlyDisplay(DISCOVERY_FORM, {
      slideOnlyMvp: false,
      enabled: true,
    });
    expect(sanitized?.questions.some((q) => q.id === 'output')).toBe(false);
  });

  it('drops output / taskType routing questions in slide-only embed', () => {
    const sanitized = sanitizeQuestionFormForSlideOnlyEmbed(DISCOVERY_FORM);
    expect(sanitized?.questions.map((q) => q.id)).toEqual(['platform', 'audience']);
    expect(sanitized?.questions.some((q) => q.label.includes('어떤 형태'))).toBe(false);
  });

  it('keeps only deck-friendly platform options', () => {
    const sanitized = sanitizeQuestionFormForSlideOnlyEmbed(DISCOVERY_FORM)!;
    const platform = sanitized.questions.find((q) => q.id === 'platform')!;
    expect(platform.options?.map((o) => o.label)).toEqual([
      'Fixed canvas (16:9, 1920×1080)',
      'Web viewer (responsive)',
    ]);
  });

  it('strips taskType from task-type forms but keeps deck brief fields', () => {
    const taskTypeForm: QuestionForm = {
      id: 'task-type',
      title: '작업 유형 선택',
      questions: [
        {
          id: 'taskType',
          label: '무엇을 만들까요?',
          type: 'radio',
          options: [opt('Prototype'), opt('Slide deck'), opt('Image')],
        },
        { id: 'audience', label: 'Audience', type: 'text' },
        { id: 'scale', label: 'Scale', type: 'text' },
      ],
    };
    const sanitized = sanitizeQuestionFormForSlideOnlyEmbed(taskTypeForm);
    expect(sanitized?.questions.map((q) => q.id)).toEqual(['audience', 'scale']);
  });

  it('suppresses direction-cards and media-* forms entirely', () => {
    expect(
      sanitizeQuestionFormForSlideOnlyEmbed({
        id: 'direction-cards',
        title: 'Pick a direction',
        questions: [{ id: 'dir', label: 'Dir', type: 'direction-cards', options: [] }],
      }),
    ).toBeNull();
    expect(
      sanitizeQuestionFormForSlideOnlyEmbed({
        id: 'media-image',
        title: 'Image brief',
        questions: [{ id: 'prompt', label: 'Prompt', type: 'text' }],
      }),
    ).toBeNull();
  });

  it('drops routing radio even when question id is localized', () => {
    const form: QuestionForm = {
      id: 'discovery',
      title: 'Brief',
      questions: [
        {
          id: 'custom_output',
          label: '어떤 형태로 만들까요?',
          type: 'radio',
          options: [
            opt('슬라이드 덱 / 발표자료'),
            opt('단일 웹 프로토타입 / 랜딩'),
            opt('멀티스크린 앱 프로토타입'),
            opt('대시보드 / 툴 UI'),
          ],
        },
        { id: 'audience', label: 'Audience', type: 'text' },
      ],
    };
    const sanitized = sanitizeQuestionFormForSlideOnlyEmbed(form);
    expect(sanitized?.questions.map((q) => q.id)).toEqual(['audience']);
  });

  it('filters platform question by Korean label', () => {
    const form: QuestionForm = {
      id: 'discovery',
      title: 'Brief',
      questions: [
        {
          id: 'target',
          label: '대상 플랫폼',
          type: 'checkbox',
          options: [opt('iOS 앱'), opt('Fixed canvas (16:9, 1920×1080)')],
        },
      ],
    };
    const sanitized = sanitizeQuestionFormForSlideOnlyEmbed(form)!;
    expect(sanitized.questions[0]?.options?.map((o) => o.label)).toEqual([
      'Fixed canvas (16:9, 1920×1080)',
    ]);
  });

  it('returns null when every question is removed', () => {
    expect(
      sanitizeQuestionFormForSlideOnlyEmbed({
        id: 'discovery',
        title: 'Brief',
        questions: [
          {
            id: 'output',
            label: 'Output',
            type: 'radio',
            options: [opt('Slide deck / pitch'), opt('Dashboard / tool UI')],
          },
        ],
      }),
    ).toBeNull();
  });
});
