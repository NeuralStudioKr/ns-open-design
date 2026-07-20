import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/frontmatter.js';

function data(src: string) {
  return parseFrontmatter(`---\n${src}\n---\n`).data;
}

describe('parseFrontmatter block sequences and arrays', () => {
  it('parses a flush-left block sequence', () => {
    expect(data('tags:\n- a\n- b').tags).toEqual(['a', 'b']);
  });

  it('parses a nested flush-left sequence without dropping enclosing keys', () => {
    expect(data('od:\n  craft:\n    requires:\n    - alpha\n    - beta').od).toEqual({
      craft: { requires: ['alpha', 'beta'] },
    });
  });

  it('parses a flush-left sequence of single-line objects', () => {
    expect(data('items:\n- k: 1\n  v: 2\n- k: 3').items).toEqual([{ k: 1, v: 2 }, { k: 3 }]);
  });

  it('returns to the parent level for a key following a flush-left sequence', () => {
    expect(data('tags:\n- a\n- b\nname: foo')).toEqual({ tags: ['a', 'b'], name: 'foo' });
  });

  it('does not split inline-array elements on commas inside quotes', () => {
    expect(data('a: ["a,b", "c"]').a).toEqual(['a,b', 'c']);
    expect(data("a: ['x, y', z]").a).toEqual(['x, y', 'z']);
  });

  it('treats an apostrophe inside an unquoted inline-array element as literal', () => {
    expect(data("tags: [don't, stop]").tags).toEqual(["don't", 'stop']);
  });

  it('strips a block scalar to its own base indentation', () => {
    expect(data('text: |\n    line one\n    line two').text).toBe('line one\nline two');
  });

  it('preserves relative indentation inside a block scalar', () => {
    expect(data('text: |\n  a\n    b').text).toBe('a\n  b');
  });
});
