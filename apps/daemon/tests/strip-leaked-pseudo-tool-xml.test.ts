import { describe, expect, it } from 'vitest';

import { stripLeakedPseudoToolXml } from '../src/think-tag-splitter.js';

describe('stripLeakedPseudoToolXml', () => {
  it('removes function_calls and invoke narration blocks', () => {
    const input = [
      'Answer.',
      '<function_calls><invoke name="TodoWrite"><parameter name="todos">[]</parameter></invoke></function_calls>',
      '<invoke name="Write"><parameter name="path">index.html</parameter></invoke>',
      'Done.',
    ].join('\n');
    const out = stripLeakedPseudoToolXml(input);
    expect(out).not.toContain('function_calls');
    expect(out).not.toContain('TodoWrite');
    expect(out).not.toContain('<invoke');
    expect(out).toContain('Answer.');
    expect(out).toContain('Done.');
  });

  it('removes todo-list pseudo-tool blocks', () => {
    const input = 'Plan:\n<todo-list><item>Step 1</item></todo-list>\nProceed.';
    const out = stripLeakedPseudoToolXml(input);
    expect(out).not.toContain('todo-list');
    expect(out).toContain('Plan:');
    expect(out).toContain('Proceed.');
  });
});
