import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const assistant = readFileSync(
  join(here, '../../src/components/AssistantMessage.tsx'),
  'utf8',
);
const fileOps = readFileSync(
  join(here, '../../src/components/FileOpsSummary.tsx'),
  'utf8',
);
const toolsCss = readFileSync(
  join(here, '../../src/styles/viewer/tools.css'),
  'utf8',
);
const routinesCss = readFileSync(
  join(here, '../../src/styles/viewer/routines.css'),
  'utf8',
);

describe('produced-files chip actions', () => {
  it('omits download from turn produced-files list (raw HTML renders without deck host)', () => {
    const fnStart = assistant.indexOf('function ProducedFiles(');
    expect(fnStart).toBeGreaterThan(-1);
    const nextFn = assistant.indexOf('\nfunction ', fnStart + 1);
    const body = assistant.slice(fnStart, nextFn === -1 ? undefined : nextFn);

    expect(body).toContain('assistant.openFile');
    expect(body).not.toContain('assistant.downloadFile');
    expect(body).not.toContain('projectFileUrl(');
    expect(body).not.toMatch(/\bdownload\b/);
  });

  it('names Open with the file for screen readers', () => {
    const fnStart = assistant.indexOf('function ProducedFiles(');
    const nextFn = assistant.indexOf('\nfunction ', fnStart + 1);
    const body = assistant.slice(fnStart, nextFn === -1 ? undefined : nextFn);
    expect(body).toContain("aria-label={t(\"tool.openInTab\", { name: f.name })}");
    expect(fileOps).toContain("aria-label={t('tool.openInTab', { name: entry.path })}");
  });

  it('does not paint non-clickable rows as hover targets', () => {
    expect(toolsCss).not.toMatch(/\.produced-file:hover\s*\{/);
    expect(toolsCss).not.toMatch(/\.file-ops-row:hover\s*\{/);
    expect(toolsCss).toContain('.produced-file-actions .ghost:focus-visible');
    expect(toolsCss).toContain('.file-ops-row-open:focus-visible');
  });
});

describe('toast surface tokens', () => {
  it('uses product green/red tokens and an anchor for centering', () => {
    expect(routinesCss).toContain('.od-toast-anchor');
    expect(routinesCss).toContain('background: var(--green-bg)');
    expect(routinesCss).toContain('background: var(--red-bg)');
    expect(routinesCss).toContain('.od-toast.tone-loading');
    expect(routinesCss).toContain('.od-toast-action:active');
    expect(routinesCss).toContain('.od-memory-toast');
    expect(routinesCss).not.toMatch(/var\(--success/);
    expect(routinesCss).not.toMatch(/var\(--danger/);
  });
});
