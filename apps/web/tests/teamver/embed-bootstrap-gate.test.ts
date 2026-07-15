import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '../..');

describe('embed bootstrap gate', () => {
  it('keeps one loading shell until embed boot + chrome reveal', () => {
    const gate = readFileSync(resolve(webRoot, 'src/components/EmbedBootstrapGate.tsx'), 'utf8');
    const shell = readFileSync(resolve(webRoot, 'src/components/EmbedLoadingShell.tsx'), 'utf8');
    const baseCss = readFileSync(resolve(webRoot, 'src/styles/base.css'), 'utf8');
    const boot = readFileSync(resolve(webRoot, 'src/teamver/teamverEmbedBoot.ts'), 'utf8');
    expect(gate).toContain('waitForTeamverEmbedBoot');
    expect(gate).toContain('waitForTeamverEmbedChrome');
    expect(gate).toContain('revealTeamverEmbedChrome');
    expect(gate).toContain('EmbedLoadingShell');
    expect(gate).not.toContain('waitForTeamverEmbedInitialUi');
    expect(gate).toContain('embed-bootstrap-gate');
    expect(gate).toContain('embed-bootstrap-gate__stage');
    expect(boot).toContain('revealTeamverEmbedChrome');
    expect(shell).toContain('od-loading-shell');
    expect(baseCss).toContain('.od-loading-shell::before');
    expect(baseCss).toContain('.embed-route-loading');
    expect(baseCss).toContain('od-loading-shell--teamver');
    expect(baseCss).toContain('background-color: #F4EFE6');
    expect(baseCss).toContain('teamver-embed-booted');
    expect(baseCss).toContain('html.teamver-embed:not(.teamver-embed-booted)');
  });

  it('wraps the workspace shell in App', () => {
    const app = readFileSync(resolve(webRoot, 'src/App.tsx'), 'utf8');
    expect(app).toContain('EmbedBootstrapGate');
    expect(app).toContain('runTeamverEmbedSessionBoot');
    expect(app).toContain('revealTeamverEmbedChrome');
  });
});
