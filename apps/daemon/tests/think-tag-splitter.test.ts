import { describe, expect, it } from 'vitest';

import { createThinkTagSplitter } from '../src/think-tag-splitter.js';

const RT = 'redacted_thinking';
const open = `<${RT}>`;
const close = `</${RT}>`;

describe('createThinkTagSplitter', () => {
  it('routes inline redacted_thinking to thinking chunks and keeps visible prose clean', () => {
    const thinking: string[] = [];
    const splitter = createThinkTagSplitter((chunk) => thinking.push(chunk));

    expect(splitter.feed(`Before\n${open}plan`)).toEqual({
      visible: 'Before\n',
      thinking: '',
    });
    expect(splitter.feed(` step${close}\nAnswer`)).toEqual({
      visible: '\nAnswer',
      thinking: '',
    });
    expect(splitter.flush()).toEqual({ visible: '', thinking: '' });

    expect(thinking.join('')).toBe('plan step');
  });

  it('flush emits trailing thinking when stream ends inside a block', () => {
    const thinking: string[] = [];
    const splitter = createThinkTagSplitter((chunk) => thinking.push(chunk));

    splitter.feed(`${open}tail only`);
    splitter.flush();

    expect(thinking.join('')).toBe('tail only');
  });

  it('caps an unclosed think block at 64KB and does NOT leak overflow into visible', () => {
    const thinking: string[] = [];
    const splitter = createThinkTagSplitter((chunk) => thinking.push(chunk));
    const huge = 'x'.repeat(65 * 1024);

    const result = splitter.feed(`${open}${huge}`);

    expect(thinking.join('').length).toBeGreaterThan(0);
    expect(thinking.join('').length).toBeLessThanOrEqual(64 * 1024);
    // Overflow must be dropped — never painted as assistant chat prose.
    expect(result.visible).toBe('');
    expect(result.thinking).toBe('');
  });
});
