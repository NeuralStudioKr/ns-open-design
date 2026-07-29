import { describe, expect, it } from 'vitest';

import {
  coercePlainTextElementPatchBody,
  resolveElementPatchBodyForApply,
  salvageElementPatchBody,
  parseElementPatch,
} from '../../src/artifacts/element-patch';

describe('salvageElementPatchBody', () => {
  it('returns loose <patch> blocks from assistant text when artifact body is empty', () => {
    const source = [
      '수정했습니다.',
      '<artifact type="element-patch" identifier="deck"></artifact>',
      '<patch target-id="od-title-1" slide-index="2" kind="set-text">김개발 작업물</patch>',
    ].join('\n');
    expect(salvageElementPatchBody('', source)).toContain('od-title-1');
  });

  it('returns plain text inside a closed element-patch artifact', () => {
    const source =
      '<artifact type="element-patch" identifier="deck">김개발 작업물</artifact>';
    expect(salvageElementPatchBody('', source)).toBe('김개발 작업물');
  });
});

describe('coercePlainTextElementPatchBody', () => {
  it('wraps plain replacement text as a single set-text patch', () => {
    const body = coercePlainTextElementPatchBody('김개발 작업물', [
      { targetId: 'od-title-1', slideIndex: 2 },
    ]);
    expect(body).toContain('target-id="od-title-1"');
    expect(body).toContain('slide-index="2"');
    expect(body).toContain('김개발 작업물');
    const parsed = parseElementPatch(body ?? '');
    expect(parsed.ok).toBe(true);
  });
});

describe('resolveElementPatchBodyForApply', () => {
  it('salvages and parses patch output the streaming parser dropped', () => {
    const source =
      '<artifact type="element-patch" identifier="deck"></artifact>'
      + '\n<patch target-id="headline" slide-index="1" kind="set-text">New</patch>';
    const resolved = resolveElementPatchBodyForApply({
      patchBody: '    ',
      sourceText: source,
    });
    const parsed = parseElementPatch(resolved);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.patches[0]?.slideIndex).toBe(1);
    }
  });
});
