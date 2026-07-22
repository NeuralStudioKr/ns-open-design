import type { FormOption, QuestionForm } from '../../artifacts/question-form';

function opt(label: string, value = label): FormOption {
  return { label, value };
}

/**
 * Client-side Quick brief used when the model's `<question-form>` JSON is
 * malformed or slide-only sanitization removed every routing question.
 */
export function slideOnlyDiscoveryFallbackForm(locale?: string | null): QuestionForm {
  const normalized = locale?.trim().toLowerCase() ?? '';
  const isKo = normalized.startsWith('ko');
  const isZh = normalized.startsWith('zh');

  if (isKo) {
    return {
      id: 'discovery',
      title: '간단한 정보 확인 — 30초',
      description:
        '생성 전에 몇 가지만 확인할게요. 해당 없는 항목은 건너뛰어도 됩니다.',
      questions: [
        {
          id: 'audience',
          label: '대상 독자',
          type: 'text',
          placeholder: '예: 신입사원, 투자자, 내부 임원',
        },
        {
          id: 'scale',
          label: '슬라이드 분량',
          type: 'text',
          placeholder: '예: 8~10장, 15분 발표',
        },
        {
          id: 'tone',
          label: '시각적 톤',
          type: 'checkbox',
          maxSelections: 2,
          options: [
            opt('모던 미니멀'),
            opt('친근한 / 일러스트'),
            opt('전문적 / 비즈니스'),
            opt('에디토리얼'),
          ],
        },
        {
          id: 'constraints',
          label: '추가로 알려주실 내용',
          type: 'textarea',
          placeholder: '반드시 포함할 내용, 피해야 할 것, 브랜드 가이드…',
        },
      ],
    };
  }

  if (isZh) {
    return {
      id: 'discovery',
      title: '快速简报 — 30 秒',
      description: '开始生成前我会先确认这些信息。不适用的可以跳过，我会补上默认值。',
      questions: [
        {
          id: 'audience',
          label: '目标用户',
          type: 'text',
          placeholder: '例如：新员工、投资人',
        },
        {
          id: 'scale',
          label: '大概需要多少内容？',
          type: 'text',
          placeholder: '例如：8 页幻灯片',
        },
        {
          id: 'tone',
          label: '视觉调性',
          type: 'checkbox',
          maxSelections: 2,
          options: [opt('现代极简'), opt('活泼 / 插画感'), opt('专业 / 商务'), opt('编辑 / 杂志感')],
        },
        {
          id: 'constraints',
          label: '还有什么需要知道的吗？',
          type: 'textarea',
          placeholder: '必须包含的内容、需要避免的内容…',
        },
      ],
    };
  }

  return {
    id: 'discovery',
    title: 'Quick brief — 30 seconds',
    description:
      "I'll lock these in before building. Skip what doesn't apply — I'll fill defaults.",
    questions: [
      {
        id: 'audience',
        label: 'Who is this for?',
        type: 'text',
        placeholder: 'e.g. new hires, investors, internal exec review',
      },
      {
        id: 'scale',
        label: 'Roughly how much?',
        type: 'text',
        placeholder: 'e.g. 8 slides, 15-minute talk',
      },
      {
        id: 'tone',
        label: 'Visual tone',
        type: 'checkbox',
        maxSelections: 2,
        options: [
          opt('Modern minimal'),
          opt('Friendly / illustrative'),
          opt('Professional / business'),
          opt('Editorial'),
        ],
      },
      {
        id: 'constraints',
        label: 'Anything else I should know?',
        type: 'textarea',
        placeholder: 'Must-include topics, things to avoid, brand notes…',
      },
    ],
  };
}
