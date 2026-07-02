import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('BYOK terminal message PUT hooks', () => {
  it('schedules scratch sync-up and billing on terminal BYOK assistant PUT', () => {
    const source = readFileSync(
      new URL('../src/project-routes.ts', import.meta.url),
      'utf8',
    );
    const putIndex = source.indexOf(
      "app.put('/api/projects/:id/conversations/:cid/messages/:mid'",
    );
    expect(putIndex).toBeGreaterThanOrEqual(0);
    const handler = source.slice(putIndex, putIndex + 2_500);
    expect(handler).toContain('shouldReportByokUsageFromMessage(saved, m)');
    expect(handler).toContain('reportByokTeamverUsageAndBillingFromDaemon');
    expect(handler).toContain('scheduleProjectStoragePersistAfterResponse');
    expect(handler).toContain('ctx.projectStorageHooks');
    expect(handler).toContain("res.json({ ok: true, id: saved.id })");
  });

  it('does not register duplicate inline message PUT handlers in server.ts', () => {
    const serverSource = readFileSync(
      new URL('../src/server.ts', import.meta.url),
      'utf8',
    );
    const matches = serverSource.match(
      /app\.put\('\/api\/projects\/:id\/conversations\/:cid\/messages\/:mid'/g,
    );
    expect(matches ?? []).toHaveLength(0);
  });
});
