import { describe, expect, it } from 'vitest';

import {
  computeProducedFiles,
  constrainProducedFilesToTurnBaseline,
  resolveTurnStartFileBaseline,
} from '../src/produced-files';

describe('resolveTurnStartFileBaseline', () => {
  const files = [
    { name: 'deck.html' },
    { name: 'notes.md' },
  ];

  it('uses the recorded turn-start snapshot when present', () => {
    expect(
      [...resolveTurnStartFileBaseline(['deck.html'], files)],
    ).toEqual(['deck.html']);
  });

  it('treats an empty snapshot as a truly empty project at turn start', () => {
    expect([...resolveTurnStartFileBaseline([], files)]).toEqual([]);
  });

  it('falls back to the end-of-turn list for legacy rows without a snapshot', () => {
    expect([...resolveTurnStartFileBaseline(undefined, files)]).toEqual([
      'deck.html',
      'notes.md',
    ]);
  });
});

describe('computeProducedFiles', () => {
  it('returns files not present in the before-set', () => {
    const produced = computeProducedFiles(
      ['existing.html'],
      [
        { name: 'existing.html' },
        { name: 'new.html' },
      ] as never[],
    );
    expect(produced?.map((file) => file.name)).toEqual(['new.html']);
  });

  it('returns all files when the turn started from an empty project', () => {
    const produced = computeProducedFiles(
      [],
      [{ name: 'deck.html' }, { name: 'deck-2.html' }] as never[],
    );
    expect(produced?.map((file) => file.name)).toEqual(['deck.html', 'deck-2.html']);
  });

  it('returns undefined when no baseline is provided', () => {
    expect(computeProducedFiles(undefined, [] as never[])).toBeUndefined();
  });
});

describe('constrainProducedFilesToTurnBaseline', () => {
  const produced = [
    { name: 'deck.html' },
    { name: 'deck-2.html' },
    { name: 'deck-3.html' },
    { name: 'deck-4.html' },
  ] as never[];

  it('drops files that already existed before the turn', () => {
    expect(
      constrainProducedFilesToTurnBaseline(produced, [
        'deck.html',
        'deck-2.html',
        'deck-3.html',
        'deck-4.html',
      ]).map((file) => file.name),
    ).toEqual([]);
  });

  it('keeps only the delta when producedFiles was over-counted', () => {
    expect(
      constrainProducedFilesToTurnBaseline(produced, ['deck.html', 'deck-2.html']).map(
        (file) => file.name,
      ),
    ).toEqual(['deck-3.html', 'deck-4.html']);
  });

  it('keeps the first-turn list when no turn-start snapshot exists', () => {
    expect(constrainProducedFilesToTurnBaseline(produced, undefined)).toEqual(produced);
  });
});
