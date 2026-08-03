import { afterEach, describe, expect, it, vi } from 'vitest';

describe('isTeamverManualEditBoxDragEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is off in production embed when env is unset', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '');
    vi.stubEnv('VITE_TEAMVER_SITE_URL', 'https://design.teamver.com');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(false);
  });

  it('is on for staging embed when site url is staging', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '');
    vi.stubEnv('VITE_TEAMVER_SITE_URL', 'https://stg-design.teamver.com');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(true);
  });

  it('can be enabled in embed via env', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '1');
    vi.stubEnv('VITE_TEAMVER_SITE_URL', 'https://design.teamver.com');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(true);
  });

  it('can be forced off on staging via env', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '0');
    vi.stubEnv('VITE_TEAMVER_SITE_URL', 'https://stg-design.teamver.com');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(false);
  });

  it('is on outside embed by default', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '0');
    vi.stubEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE', '');
    const { isTeamverManualEditBoxDragEnabled } = await import('../src/teamver/manualEditBoxDragEnable');
    expect(isTeamverManualEditBoxDragEnabled()).toBe(true);
  });
});
