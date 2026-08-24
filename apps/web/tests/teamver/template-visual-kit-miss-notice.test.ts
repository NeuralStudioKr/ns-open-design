import { describe, expect, it } from 'vitest';

import {
  TEMPLATE_VISUAL_KIT_HEADING,
  shouldNotifyTemplateVisualKitMiss,
  skillBodyHasTemplateVisualKit,
} from '../../src/teamver/fetchPluginLocalSkill';

describe('skillBodyHasTemplateVisualKit', () => {
  it('matches the official kit heading with or without a title suffix', () => {
    expect(skillBodyHasTemplateVisualKit(`${TEMPLATE_VISUAL_KIT_HEADING}\n\n:root{}`)).toBe(true);
    expect(skillBodyHasTemplateVisualKit(`${TEMPLATE_VISUAL_KIT_HEADING} — Daisy Days\n`)).toBe(true);
    expect(skillBodyHasTemplateVisualKit('Use the Template visual kit (+ scaffold map)')).toBe(false);
    expect(skillBodyHasTemplateVisualKit('')).toBe(false);
  });
});

describe('shouldNotifyTemplateVisualKitMiss', () => {
  const missPrompt = '# Selected deck template\n\nVisual summary only. Template visual kit may be incomplete.';
  const hitPrompt = `${TEMPLATE_VISUAL_KIT_HEADING} — Capsule\n\n--bg:#fff`;

  it('notifies once when a selected template prompt has no example.html kit', () => {
    expect(shouldNotifyTemplateVisualKitMiss({
      selectedTemplateId: 'example-html-ppt-capsule',
      systemPrompt: missPrompt,
    })).toBe('example-html-ppt-capsule');
  });

  it('does not notify when the kit heading is present', () => {
    expect(shouldNotifyTemplateVisualKitMiss({
      selectedTemplateId: 'example-html-ppt-capsule',
      systemPrompt: hitPrompt,
    })).toBeNull();
  });

  it('skips hidden slide-count top-up and already-notified ids', () => {
    expect(shouldNotifyTemplateVisualKitMiss({
      selectedTemplateId: 'example-html-ppt-daisy-days',
      systemPrompt: missPrompt,
      slideCountTopUp: true,
    })).toBeNull();
    expect(shouldNotifyTemplateVisualKitMiss({
      selectedTemplateId: 'example-html-ppt-daisy-days',
      systemPrompt: missPrompt,
      alreadyNotifiedIds: ['example-html-ppt-daisy-days'],
    })).toBeNull();
    expect(shouldNotifyTemplateVisualKitMiss({
      selectedTemplateId: null,
      systemPrompt: missPrompt,
    })).toBeNull();
  });
});
