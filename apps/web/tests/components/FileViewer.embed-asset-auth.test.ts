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
    const block = fileViewer.slice(start, start + 900);
    expect(block).toContain('fetchTeamverDaemon(projectRawUrl(projectId, filePath)');
    expect(block).toContain('teamverProjectId: projectId');
    expect(block).not.toMatch(/await fetch\(projectRawUrl/);
  });

  it('passes tweaksBridge from hasTweaksTemplate into URL-load decisions', () => {
    expect(fileViewer).toContain('hasTweaksTemplate');
    expect(fileViewer).toContain('tweaksBridge: hasTweaksTemplate(source)');
  });
});
