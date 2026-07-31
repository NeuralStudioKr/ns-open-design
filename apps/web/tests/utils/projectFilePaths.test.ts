import { describe, expect, it } from 'vitest';

import { projectFilePathExists } from '../../src/utils/projectFilePaths';

describe('projectFilePathExists', () => {
  const names = new Set([
    'deck.html',
    'ms7a7838-drawing-2026-07-30T08-58-31-598Z.png',
    'browser/browser-capture-example.png',
  ]);

  it('matches exact project-relative paths', () => {
    expect(projectFilePathExists(names, 'deck.html')).toBe(true);
    expect(projectFilePathExists(names, 'browser/browser-capture-example.png')).toBe(true);
  });

  it('matches bare basenames for nested or historical paths', () => {
    expect(projectFilePathExists(names, 'browser-capture-example.png')).toBe(true);
    expect(projectFilePathExists(names, 'ms7a7838-drawing-2026-07-30T08-58-31-598Z.png')).toBe(true);
  });

  it('returns false for deleted or unknown files', () => {
    expect(projectFilePathExists(names, 'missing.png')).toBe(false);
    expect(projectFilePathExists(names, '')).toBe(false);
  });

  it('defaults to false for ephemeral drawing screenshots when the file index is unavailable', () => {
    expect(projectFilePathExists(undefined, 'ms8hq9qu-drawing-2026-07-31T05-17-03-125Z.png')).toBe(false);
    expect(projectFilePathExists(undefined, 'references/logo.png')).toBe(true);
  });
});
