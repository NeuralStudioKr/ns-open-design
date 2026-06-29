import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('live artifacts S3 sync wiring', () => {
  it('schedules persistAfterMutation on mutating live-artifact routes', () => {
    const source = readFileSync(
      new URL('../src/routes/live-artifact.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('scheduleProjectStoragePersistAfterResponse(projectStorageHooks');
    expect(source).toContain("app.patch('/api/live-artifacts/:artifactId'");
    expect(source).toContain("app.delete('/api/live-artifacts/:artifactId'");
    expect(source).toContain("app.get('/api/live-artifacts/:artifactId/preview'");
  });

  it('passes projectStorageHooks from server registration', () => {
    const serverSource = readFileSync(
      new URL('../src/server.ts', import.meta.url),
      'utf8',
    );
    const block = serverSource.slice(
      serverSource.indexOf('registerLiveArtifactRoutes(app'),
      serverSource.indexOf('registerLiveArtifactRoutes(app') + 400,
    );
    expect(block).toContain('projectStorageHooks');
  });
});
