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
    const handler = source.slice(putIndex, putIndex + 3_500);
    expect(handler).toContain('recoverTeamverConversationForWrite');
    expect(handler).toContain('shouldPersistByokProjectStorageFromMessage(saved)');
    expect(handler).toContain('shouldReportByokUsageFromMessage(saved, m)');
    expect(handler).toContain('reportByokTeamverUsageAndBillingFromDaemon');
    expect(handler).toContain('scheduleProjectStoragePersistAfterResponse');
    expect(handler).toContain('ctx.projectStorageHooks');
    expect(handler.indexOf('shouldPersistByokProjectStorageFromMessage(saved)')).toBeLessThan(
      handler.indexOf('shouldReportByokUsageFromMessage(saved, m)'),
    );
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

  it('recovers missing conversations on message GET the same way as PUT', () => {
    const source = readFileSync(
      new URL('../src/project-routes.ts', import.meta.url),
      'utf8',
    );
    const getIndex = source.indexOf(
      "app.get('/api/projects/:id/conversations/:cid/messages'",
    );
    expect(getIndex).toBeGreaterThanOrEqual(0);
    const handler = source.slice(getIndex, getIndex + 1_200);
    expect(handler).toContain('async (req, res)');
    expect(handler).toContain('recoverTeamverConversationForWrite');
    expect(handler).toContain("res.json({ messages: listMessages(db, req.params.cid) })");
  });
});
