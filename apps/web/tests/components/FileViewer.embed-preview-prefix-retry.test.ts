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
    // Valid cache must short-circuit the mint/retry loop (no per-attempt invalidate).
    expect(fileViewer).toContain('peekTeamverProjectPreviewPrefix');
    expect(fileViewer).toMatch(/Valid cache: paint immediately/);
    expect(fileViewer).toMatch(/Do not invalidate between attempts/);
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
    // Guard was widened from `!embedPreviewPrefixSettled` to also cover the
    // brief window where settle already fired but the prefix cache was
    // invalidated (auth recovery / rotation). Match either shape so the
    // regression assert stays honest without churning on unrelated tightening.
    expect(fileViewer).toMatch(
      /teamverEmbedPreviewMode\s*&&\s*\(?\s*!embedPreviewPrefixSettled/,
    );
    expect(fileViewer).toMatch(
      /if \(prev === undefined\) return;[\s\S]{0,200}?setSrcDocTransportResetKey/,
    );
    expect(fileViewer).toMatch(
      /baseHref:\s*srcDocBaseHref/,
    );
  });

  it('holds empty srcDoc through mint retries (no attempt-0 no-base paint)', () => {
    // Early fail-open painted relative Drive/composer imgs without <base>,
    // which showed broken-image + alt ("title only") until remount.
    expect(fileViewer).not.toMatch(
      /if \(attempt === 0\) \{\s*\/\/ Allow first paint without base/,
    );
    expect(fileViewer).toContain('Do NOT fail-open after');
    expect(fileViewer).toMatch(/10_000/);
  });

  it('clears prefix and holds settle on auth recovery remint', () => {
    expect(fileViewer).toMatch(
      /if \(embedAuthRecoveryNonce > 0\) \{[\s\S]{0,300}?setEmbedPreviewPrefixSettled\(false\)/,
    );
  });
});
