import { describe, expect, it } from 'vitest';

import {
  extractPlainStreamArtifacts,
  plainStdoutFromRunEvents,
} from '../src/plain-stream.js';

describe('plain-stream artifact extraction', () => {
  it('reconstructs stdout from run events', () => {
    const stdout = plainStdoutFromRunEvents([
      { event: 'stdout', data: { chunk: '<artifact ' } },
      { event: 'agent', data: { type: 'text_delta', delta: 'ignored' } },
      { event: 'stdout', data: { chunk: 'type="text/html">x</artifact>' } },
    ]);
    expect(stdout).toBe('<artifact type="text/html">x</artifact>');
  });

  it('extracts a complete html artifact block', () => {
    const stdout = [
      '<artifact identifier="deck" type="text/html" title="Deck">',
      '<!doctype html><html><body>ok</body></html>',
      '</artifact>',
    ].join('');
    const artifacts = extractPlainStreamArtifacts(stdout);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.fileName).toBe('deck.html');
    expect(artifacts[0]?.content).toContain('<!doctype html>');
  });

  it('ignores artifact-like text inside markdown fences', () => {
    const stdout = [
      '```html',
      '<artifact type="text/html">fake</artifact>',
      '```',
      '<artifact identifier="real" type="text/html" title="Real">',
      '<!doctype html><html></html>',
      '</artifact>',
    ].join('\n');
    const artifacts = extractPlainStreamArtifacts(stdout);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.identifier).toBe('real');
  });
});
