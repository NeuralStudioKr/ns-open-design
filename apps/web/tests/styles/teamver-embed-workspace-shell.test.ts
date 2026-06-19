import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const teamverCss = readFileSync(
  new URL('../../src/styles/teamver.css', import.meta.url),
  'utf8',
);

describe('Teamver embed workspace shell', () => {
  it('collapses tab chrome height when workspace tabs are hidden', () => {
    expect(teamverCss).toContain('.workspace-shell.workspace-shell--no-tabs');
    expect(teamverCss).toMatch(
      /\.workspace-shell\.workspace-shell--no-tabs[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)/,
    );
    expect(teamverCss).toMatch(
      /\.workspace-shell\.workspace-shell--no-tabs[\s\S]*--workspace-tabs-chrome-height:\s*0px/,
    );
  });
});
