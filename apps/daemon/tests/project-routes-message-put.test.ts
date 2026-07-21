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

  it('limits missing-conversation write recovery to Teamver managed projects', () => {
    const source = readFileSync(
      new URL('../src/project-routes.ts', import.meta.url),
      'utf8',
    );
    const helperIndex = source.indexOf('function recoverTeamverConversationForWrite');
    expect(helperIndex).toBeGreaterThanOrEqual(0);
    const helper = source.slice(helperIndex, helperIndex + 1_400);

    expect(helper).toContain('isTeamverDesignManaged()');
    expect(helper).toContain('isSafeId(projectId)');
    expect(helper).toContain('isSafeId(conversationId)');
    expect(
      helper.includes('getProject(db, projectId)')
      || helper.includes('getProjectAsync(db, projectId)'),
    ).toBe(true);
    expect(helper).toContain('insertConversation(db');
    expect(helper).toContain('teamver_conversation_recovered_for_write');
  });
});
