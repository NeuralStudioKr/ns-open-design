import { describe, expect, it } from 'vitest';
import { repairArtifactDocumentHead } from '@open-design/contracts';
import {
  artifactDocumentHeadLooksIntact,
  repairArtifactDocumentHeadIfNeeded,
} from '../../src/runtime/artifact-document-head';

const INTACT = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Deck</title>
</head>
<body><section class="slide">Hi</section></body>
</html>`;

const CORRUPT = `<!doctype html>
<html>
<head>
viewport=device-width
<meta charset="utf-8" />
</head>
<body><section class="slide">Hi</section></body>
</html>`;

describe('artifact-document-head', () => {
  it('gates intact heads and still repairs corrupted heads', () => {
    expect(artifactDocumentHeadLooksIntact(INTACT)).toBe(true);
    expect(repairArtifactDocumentHeadIfNeeded(INTACT)).toBe(INTACT);
    expect(artifactDocumentHeadLooksIntact(CORRUPT)).toBe(false);
    expect(repairArtifactDocumentHeadIfNeeded(CORRUPT)).toBe(
      repairArtifactDocumentHead(CORRUPT),
    );
  });
});
