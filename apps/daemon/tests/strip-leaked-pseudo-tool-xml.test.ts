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

  it('removes agent runtime info narration leaked into stdout', () => {
    const input = [
      '<info>TodoWrite called with 9 tasks</info>',
      '슬라이드 구성 계획:',
      '<info>Marking task 2 as completed</info>',
    ].join('\n');
    const out = stripLeakedPseudoToolXml(input);
    expect(out).not.toContain('<info>');
    expect(out).not.toContain('TodoWrite called');
    expect(out).toContain('슬라이드 구성 계획:');
  });

  it('removes thinking tags, fake file reads, and bare status lines', () => {
    const input = [
      '<thinking>hidden</thinking>',
      '[读取 template.html]',
      'Marking task 1 as in_progress',
      'Visible answer.',
    ].join('\n');
    const out = stripLeakedPseudoToolXml(input);
    expect(out).toBe('Visible answer.');
  });

  it('removes Cursor-style tool_call JSON blocks', () => {
    const input = [
      'Plan ready.',
      '<tool_call>',
      '{"name":"TodoUpdate","arguments":{"updates":[]}}',
      '</tool_call>',
      '<tool_result>ok</tool_result>',
      'Proceed.',
    ].join('\n');
    const out = stripLeakedPseudoToolXml(input);
    expect(out).not.toContain('tool_call');
    expect(out).not.toContain('TodoUpdate');
    expect(out).toContain('Plan ready.');
    expect(out).toContain('Proceed.');
  });
});
