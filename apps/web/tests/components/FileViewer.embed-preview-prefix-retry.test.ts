import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fileViewer = readFileSync(join(here, '../../src/components/FileViewer.tsx'), 'utf8');

describe('FileViewer embed preview prefix recovery', () => {
  it('retries preview prefix after auth recovery instead of one-shot fail-open', () => {
    expect(fileViewer).toContain('invalidateTeamverProjectPreviewPrefix');
    expect(fileViewer).toContain('embedAuthRecoveryNonce');
    expect(fileViewer).toContain('retryDelaysMs');
    // Auth recovery must be in the effect dependency list.
    expect(fileViewer).toMatch(
      /\[embedAuthRecoveryNonce,\s*file\.name,\s*projectId,\s*teamverEmbedPreviewMode\]/,
    );
  });

  it('remounts srcDoc when the scoped preview prefix arrives so entry paint is not blank', () => {
    // Page entry used to inject <base href="about:blank"> then update the
    // srcDoc string when the prefix resolved — without a remount the iframe
    // stayed blank until toolbar refresh. Hold srcDoc until prefix settle,
    // skip remount on the first settle paint, and remount when a fail-open
    // / rotated prefix changes the base.
    expect(fileViewer).toContain('resolveHtmlPreviewSrcDocBaseHref');
    expect(fileViewer).toContain('srcDocBaseHref');
    expect(fileViewer).toContain('embedPreviewPrefixSettled');
    expect(fileViewer).toContain('prevEmbedPreviewPrefixRef');
    expect(fileViewer).toContain('failOpenPaintTimer');
    expect(fileViewer).toMatch(
      /teamverEmbedPreviewMode && !embedPreviewPrefixSettled/,
    );
    expect(fileViewer).toMatch(
      /if \(prev === undefined\) return;[\s\S]{0,200}?setSrcDocTransportResetKey/,
    );
    expect(fileViewer).toMatch(
      /baseHref:\s*srcDocBaseHref/,
    );
  });
});
