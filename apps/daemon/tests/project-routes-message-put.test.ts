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
    expect(handler).toContain('ensureTeamverConversation');
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

  it('does not re-register dead conversation CRUD in server.ts after project-routes', () => {
    const serverSource = readFileSync(
      new URL('../src/server.ts', import.meta.url),
      'utf8',
    );
    // registerProjectRoutes owns conversation CRUD; a second copy without
    // ensureTeamverConversation would regress HA recovery if order flipped.
    expect(serverSource).toContain('Do NOT re-register GET/POST/PATCH/DELETE conversations');
    const registerIdx = serverSource.indexOf('registerProjectRoutes(app,');
    expect(registerIdx).toBeGreaterThanOrEqual(0);
    const after = serverSource.slice(registerIdx);
    expect(after).not.toMatch(
      /app\.get\('\/api\/projects\/:id\/conversations',\s*async/,
    );
    expect(after).not.toMatch(
      /app\.post\('\/api\/projects\/:id\/conversations',\s*async/,
    );
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
    expect(handler).toContain('ensureTeamverConversation');
    expect(handler).toMatch(/listMessagesAsync[\s\S]*listMessages\(db/);
  });

  it('recovers missing conversations on every preview comments route', () => {
    const source = readFileSync(
      new URL('../src/project-routes.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('async function ensureTeamverConversation');
    expect(source).toContain('listConversationsAsync');
    expect(source).toContain('insertConversationAsync');
    for (const needle of [
      "app.get('/api/projects/:id/conversations/:cid/comments'",
      "app.post('/api/projects/:id/conversations/:cid/comments'",
      "app.patch(\n    '/api/projects/:id/conversations/:cid/comments/:commentId'",
      "app.delete(\n    '/api/projects/:id/conversations/:cid/comments/:commentId'",
    ]) {
      const idx = source.indexOf(needle);
      expect(idx, `missing route ${needle}`).toBeGreaterThanOrEqual(0);
      const handler = source.slice(idx, idx + 900);
      expect(handler).toContain('ensureTeamverConversation');
    }
    const getComments = source.indexOf(
      "app.get('/api/projects/:id/conversations/:cid/comments'",
    );
    const getHandler = source.slice(getComments, getComments + 900);
    expect(getHandler).toContain('listPreviewCommentsAsync');
  });

  it('source-pins postgres conversation insert to be conflict-safe', () => {
    const source = readFileSync(
      new URL('../src/storage/daemon-db-postgres-core.ts', import.meta.url),
      'utf8',
    );
    const idx = source.indexOf('export async function pgInsertConversation');
    expect(idx).toBeGreaterThanOrEqual(0);
    const block = source.slice(idx, idx + 700);
    expect(block).toContain('ON CONFLICT (id) DO NOTHING');
  });
});
