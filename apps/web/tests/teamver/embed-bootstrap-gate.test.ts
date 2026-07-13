import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '../..');

describe('embed bootstrap gate', () => {
  it('keeps the loading shell until embed boot completes', () => {
    const gate = readFileSync(resolve(webRoot, 'src/components/EmbedBootstrapGate.tsx'), 'utf8');
    const baseCss = readFileSync(resolve(webRoot, 'src/styles/base.css'), 'utf8');
    expect(gate).toContain('waitForTeamverEmbedBoot');
    expect(gate).toContain('waitForTeamverEmbedInitialUi');
    expect(gate).toContain('resolveLoadingShellLabel');
    expect(gate).toContain('embed-bootstrap-gate');
    expect(gate).toContain('embed-bootstrap-gate__stage');
    expect(baseCss).toContain('.od-loading-shell::before');
    expect(baseCss).toContain('.embed-route-loading');
    expect(baseCss).toContain('background: var(--bg-app)');
  });

  it('wraps the workspace shell in App', () => {
    const app = readFileSync(resolve(webRoot, 'src/App.tsx'), 'utf8');
    expect(app).toContain('EmbedBootstrapGate');
    expect(app).toContain('runTeamverEmbedSessionBoot');
  });
});
