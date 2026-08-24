import { describe, expect, it } from 'vitest';

import { buildInlineMentionParts, type InlineMentionEntity } from '../../src/utils/inlineMentions';

describe('buildInlineMentionParts', () => {
  it('skips entity matching when plain text has no mention marker', () => {
    const entities: InlineMentionEntity[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `file-${index}`,
      kind: 'file',
      label: `file-${index}.html`,
      token: `@file-${index}.html`,
    }));

    expect(buildInlineMentionParts('typing ordinary Chinese text without mentions', entities)).toBeNull();
  });

  it('does not normalize entities on plain text drafts', () => {
    const entity = {
      id: 'index.html',
      kind: 'file',
      label: 'index.html',
      get token() {
        throw new Error('token should not be read for plain text');
      },
    } as InlineMentionEntity;

    expect(buildInlineMentionParts('plain text only', [entity])).toBeNull();
  });

  it('still highlights known mentions when the draft contains a marker', () => {
    const parts = buildInlineMentionParts('Review @index.html', [
      { id: 'index.html', kind: 'file', label: 'index.html' },
    ]);

    expect(parts).toEqual([
      { kind: 'text', text: 'Review ' },
      {
        kind: 'mention',
        text: '@index.html',
        entity: {
          id: 'index.html',
          kind: 'file',
          label: 'index.html',
          token: '@index.html',
        },
      },
    ]);
  });

  it('matches NFC file entities against NFD Hangul @mentions in history text', () => {
    const nfc = '서빙하는-금붕어'.normalize('NFC');
    const nfd = '서빙하는-금붕어'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    const basename = `msh9rso1-${nfc}.webp`;
    const parts = buildInlineMentionParts(
      `이 이미지 넣어줘 @msh9rso1-${nfd}.webp`,
      [
        {
          id: basename,
          kind: 'file',
          label: basename,
          token: `@${basename}`,
        },
      ],
      { highlightUnknown: false },
    );
    expect(parts?.some((part) => part.kind === 'mention' && part.entity.kind === 'file')).toBe(true);
    expect(parts?.find((part) => part.kind === 'mention')?.text).toBe(`@${basename}`);
  });

  it('rebuilds the mention index after entities are mutated in place', () => {
    const entities: InlineMentionEntity[] = [];
    // First call caches an empty trie on this array reference.
    expect(buildInlineMentionParts('@goldfish.webp', entities, { highlightUnknown: false })).toBeNull();
    entities.push({
      id: 'goldfish.webp',
      kind: 'file',
      label: 'goldfish.webp',
      token: '@goldfish.webp',
    });
    const parts = buildInlineMentionParts('@goldfish.webp', entities, { highlightUnknown: false });
    expect(parts?.[0]).toMatchObject({
      kind: 'mention',
      text: '@goldfish.webp',
      entity: { kind: 'file', id: 'goldfish.webp' },
    });
  });

  it('reuses the normalized mention index across draft updates', () => {
    let tokenReads = 0;
    const entities: InlineMentionEntity[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `file-${index}`,
      kind: 'file',
      label: `file-${index}.html`,
      get token() {
        tokenReads += 1;
        return `@file-${index}.html`;
      },
    }));

    expect(buildInlineMentionParts('@missing-one', entities)).toEqual([
      {
        kind: 'mention',
        text: '@missing-one',
        entity: {
          id: 'unknown:@missing-one',
          kind: 'unknown',
          label: 'missing-one',
          token: '@missing-one',
          title: '@missing-one',
        },
      },
    ]);
    expect(buildInlineMentionParts('@missing-two', entities)).toEqual([
      {
        kind: 'mention',
        text: '@missing-two',
        entity: {
          id: 'unknown:@missing-two',
          kind: 'unknown',
          label: 'missing-two',
          token: '@missing-two',
          title: '@missing-two',
        },
      },
    ]);
    expect(tokenReads).toBe(entities.length);
  });

  it('preserves longest known mentions that contain spaces', () => {
    const parts = buildInlineMentionParts('Open @docs/read me.md now', [
      { id: 'docs/read me.md', kind: 'file', label: 'docs/read me.md' },
    ]);

    expect(parts).toEqual([
      { kind: 'text', text: 'Open ' },
      {
        kind: 'mention',
        text: '@docs/read me.md',
        entity: {
          id: 'docs/read me.md',
          kind: 'file',
          label: 'docs/read me.md',
          token: '@docs/read me.md',
        },
      },
      { kind: 'text', text: ' now' },
    ]);
  });
});
