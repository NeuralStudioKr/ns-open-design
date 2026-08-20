import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fileViewerSource = readFileSync(
  join(here, '../../src/components/FileViewer.tsx'),
  'utf8',
);

describe('manual edit history-confirm pin ordering', () => {
  it('does not pin the pre-edit baseSource before history confirm', () => {
    const start = fileViewerSource.indexOf('async function applyManualEdit(');
    expect(start).toBeGreaterThan(0);
    const block = fileViewerSource.slice(start, start + 4800);
    const confirmAt = block.indexOf('confirmManualEditHistorySource(');
    const pinResultAt = block.indexOf('pinManualEditSavedSource(contentToSave)');
    expect(confirmAt).toBeGreaterThan(0);
    expect(pinResultAt).toBeGreaterThan(confirmAt);
    // Premature pin of the pre-edit buffer would make history confirm always
    // trust local and overwrite real external disk changes.
    expect(block).not.toContain('pinManualEditSavedSource(baseSource)');
  });
});
