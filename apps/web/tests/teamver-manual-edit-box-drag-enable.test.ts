import { afterEach, describe, expect, it, vi } from 'vitest';

describe('isTeamverManualEditBoxDragEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults on when the env flag is unset (prod embed included)', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '');
    vi.stubEnv('VITE_TEAMVER_SITE_URL', 'https://design.teamver.com');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(true);
  });

  it('defaults on for staging hosts when unset', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '');
    vi.stubEnv('VITE_TEAMVER_SITE_URL', 'https://stg-design.teamver.com');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(true);
  });

  it('honors explicit enable', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '1');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(true);
  });

  it('honors explicit kill-switch', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '0');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(false);
  });

  it('defaults on outside teamver embed', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '0');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(true);
  });
});
