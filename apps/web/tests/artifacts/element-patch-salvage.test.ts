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

  it('round-trips dom: CSS path target ids that contain ">"', () => {
    const targetId = 'dom:body > section:nth-of-type(1) > h1:nth-of-type(1)';
    const body = coercePlainTextElementPatchBody('새 제목', [
      { targetId, slideIndex: 0 },
    ]);
    expect(body).toBeTruthy();
    const parsed = parseElementPatch(body ?? '');
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.patches[0]).toMatchObject({
      id: targetId,
      slideIndex: 0,
      kind: 'set-text',
      value: '새 제목',
    });
  });
});

describe('salvageElementPatchBody with dom selectors', () => {
  it('salvages loose <patch> blocks whose target-id contains ">"', () => {
    const targetId = 'dom:body > section:nth-of-type(2) > p:nth-of-type(1)';
    const source = [
      '수정했습니다.',
      `<patch target-id="${targetId}" slide-index="1" kind="set-text">본문</patch>`,
    ].join('\n');
    const salvaged = salvageElementPatchBody('', source);
    expect(salvaged).toContain('slide-index="1"');
    const parsed = parseElementPatch(salvaged ?? '');
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.patches[0]?.id).toBe(targetId);
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

  it('synthesizes set-text patch from quoted user instruction when body is empty', () => {
    const resolved = resolveElementPatchBodyForApply({
      patchBody: '',
      coerceHints: [{ targetId: 'od-title-1', slideIndex: 2 }],
      instructionText: "'김개발'로 바꿔줘",
    });
    expect(resolved).toContain('target-id="od-title-1"');
    expect(resolved).toContain('김개발');
    const parsed = parseElementPatch(resolved);
    expect(parsed.ok).toBe(true);
  });
});
