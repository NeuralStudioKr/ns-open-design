import { afterEach, describe, expect, it, vi } from 'vitest';

describe('isTeamverDrawAnnotationEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is off in production embed when env is unset', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_DRAW_ANNOTATION_ENABLE', '');
    vi.stubEnv('VITE_TEAMVER_SITE_URL', 'https://design.teamver.com');
    const { isTeamverDrawAnnotationEnabled } = await import('../src/teamver/drawAnnotationEnable');
    expect(isTeamverDrawAnnotationEnabled()).toBe(false);
  });

  it('is on for staging embed when site url is staging', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_DRAW_ANNOTATION_ENABLE', '');
    vi.stubEnv('VITE_TEAMVER_SITE_URL', 'https://stg-design.teamver.com');
    const { isTeamverDrawAnnotationEnabled } = await import('../src/teamver/drawAnnotationEnable');
    expect(isTeamverDrawAnnotationEnabled()).toBe(true);
  });

  it('can be enabled in embed via env', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '1');
    vi.stubEnv('VITE_TEAMVER_DRAW_ANNOTATION_ENABLE', '1');
    const { isTeamverDrawAnnotationEnabled } = await import('../src/teamver/drawAnnotationEnable');
    expect(isTeamverDrawAnnotationEnabled()).toBe(true);
  });

  it('is on outside embed by default', async () => {
    vi.stubEnv('VITE_TEAMVER_EMBED', '0');
    vi.stubEnv('VITE_TEAMVER_DRAW_ANNOTATION_ENABLE', '');
    const { isTeamverDrawAnnotationEnabled } = await import('../src/teamver/drawAnnotationEnable');
    expect(isTeamverDrawAnnotationEnabled()).toBe(true);
  });
});
