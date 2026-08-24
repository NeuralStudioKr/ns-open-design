import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fileViewer = readFileSync(join(here, '../../src/components/FileViewer.tsx'), 'utf8');

describe('FileViewer embed asset / tweaks guards', () => {
  it('fetches relative srcDoc assets through fetchTeamverDaemon', () => {
    const start = fileViewer.indexOf('async function fetchProjectRelativeText(');
    expect(start).toBeGreaterThan(0);
    // Widened window because the helper now iterates NFC / NFD candidates
    // before giving up. That refactor changed the variable in the URL builder
    // from `filePath` to `candidate` — assert on the callsite shape instead of
    // the literal identifier so the guard stays honest without turning into
    // false-positive noise on unrelated Unicode-tolerance fixes.
    const block = fileViewer.slice(start, start + 1600);
    expect(block).toMatch(/fetchTeamverDaemon\(projectRawUrl\(projectId, \w+\)/);
    expect(block).toContain('teamverProjectId: projectId');
    expect(block).not.toMatch(/await fetch\(projectRawUrl/);
  });

  it('passes tweaksBridge from hasTweaksTemplate into URL-load decisions', () => {
    expect(fileViewer).toContain('hasTweaksTemplate');
    expect(fileViewer).toContain('tweaksBridge: hasTweaksTemplate(source)');
  });
});
