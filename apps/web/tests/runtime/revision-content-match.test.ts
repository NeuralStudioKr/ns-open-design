// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { repairArtifactDocumentHead } from '@open-design/contracts';
import { revisionSnapshotContentMatches } from '../../src/runtime/revision-content-match';

const CORRUPT_HEAD = '<html><head>viewport=width=device-width, initial-scale=1" /><title>Deck</title></head><body>Hi</body></html>';

describe('revision-content-match', () => {
  it('matches exact bytes', () => {
    const html = '<html><head></head><body>Hi</body></html>';
    expect(revisionSnapshotContentMatches(html, html)).toBe(true);
  });

  it('matches after head repair normalization', () => {
    const repaired = repairArtifactDocumentHead(CORRUPT_HEAD);
    expect(revisionSnapshotContentMatches(CORRUPT_HEAD, repaired)).toBe(true);
    expect(repairArtifactDocumentHead(CORRUPT_HEAD)).toBe(repairArtifactDocumentHead(repaired));
  });

  it('returns false when content truly diverges', () => {
    expect(revisionSnapshotContentMatches('<html>a</html>', '<html>b</html>')).toBe(false);
    expect(revisionSnapshotContentMatches(null, '<html>b</html>')).toBe(false);
  });
});
