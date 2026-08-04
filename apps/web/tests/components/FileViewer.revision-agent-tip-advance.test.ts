import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fileViewer = readFileSync(join(here, '../../src/components/FileViewer.tsx'), 'utf8');

describe('FileViewer revision tip advance after undo', () => {
  it('clears restore pin and paints tip cache when refresh advances past undo cursor', () => {
    const start = fileViewer.indexOf('const refreshRevisionStack = useCallback');
    expect(start).toBeGreaterThan(0);
    const block = fileViewer.slice(start, start + 2_400);
    expect(block).toContain('resolveRevisionCursorId');
    expect(block).toContain('getActiveRevisionSequence');
    expect(block).toContain('advancedPastUndo');
    expect(block).toContain('manualEditPinnedSourceRef.current = null');
    expect(block).toContain('getRevisionContentCache');
  });
});
