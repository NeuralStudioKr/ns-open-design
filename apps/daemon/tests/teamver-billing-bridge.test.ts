import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commitTeamverBillingFromDaemon,
  refundTeamverBillingFromDaemon,
  resolveTeamverBillingReserveAmountFromDaemon,
  reserveTeamverBillingFromDaemon,
} from '../src/teamver-billing-bridge.js';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function findUsage5xxMarker(spy: ReturnType<typeof vi.spyOn>, stage: string) {
  for (const call of spy.mock.calls) {
    const arg = call[0];
    if (typeof arg !== 'string') continue;
    try {
      const parsed = JSON.parse(arg) as Record<string, unknown>;
      if (parsed.metric === 'teamver_usage_5xx' && parsed.stage === stage) {
        return parsed;
      }
    } catch {
      // ignore non-JSON warns
    }
  }
  return null;
}

const identity = { userId: 'u-1', workspaceId: 'ws-1' };

describe('teamver-billing-bridge', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('resolveTeamverBillingReserveAmountFromDaemon', () => {
    it('returns metered amount from estimate-reserve endpoint', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, { amount_t: 42, policy: 'metered', model_name: 'claude-sonnet-4-5' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const amount = await resolveTeamverBillingReserveAmountFromDaemon({
        modelName: 'claude-sonnet-4-5',
      });

      expect(amount).toBe(42);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/internal/billing/estimate-reserve');
    });

    it('returns 0 when teamver env is not configured', async () => {
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(resolveTeamverBillingReserveAmountFromDaemon({ modelName: 'm' })).resolves.toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('reserveTeamverBillingFromDaemon', () => {
    it('skips without HTTP when teamver env is not configured', async () => {
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 100,
      });

      expect(result).toEqual({ ok: true, usageId: null, skipped: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips when identity has no workspaceId', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity: null,
        amount: 100,
      });

      expect(result.ok).toBe(true);
      expect(result.usageId).toBeNull();
      expect(result.skipped).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects negative amount before any HTTP call', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: -1,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid_amount');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns usage_id on a 200 success response', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');
      const fetchMock: FetchMock = vi.fn(async () =>
        jsonResponse(200, { ok: true, usage_id: 'u-1' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 100,
        reason: 'design_run',
      });

      expect(result).toEqual({ ok: true, usageId: 'u-1', skipped: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://design-api:16000/api/internal/billing/reserve');
      expect((init.headers as Record<string, string>)['X-Teamver-Internal-Api-Key']).toBe('secret-key');
      expect(JSON.parse(String(init.body))).toEqual({
        workspace_id: 'ws-1',
        amount: 100,
        reason: 'design_run',
      });
    });

    it('uses TEAMVER_BILLING_RESERVE_AMOUNT fallback when caller amount is 0', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      vi.stubEnv('TEAMVER_BILLING_RESERVE_AMOUNT', '50');
      const fetchMock: FetchMock = vi.fn(async () =>
        jsonResponse(200, { ok: true, usage_id: 'u-2' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 0,
      });
      expect(result.ok).toBe(true);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body)).amount).toBe(50);
    });

    it('caller amount > 0 takes priority over RESERVE_AMOUNT fallback', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      vi.stubEnv('TEAMVER_BILLING_RESERVE_AMOUNT', '50');
      const fetchMock: FetchMock = vi.fn(async () =>
        jsonResponse(200, { ok: true, usage_id: 'u-3' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 7,
      });
      expect(result.ok).toBe(true);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body)).amount).toBe(7);
    });

    it('skips without HTTP when caller amount is 0 and fallback is not configured', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 0,
      });
      expect(result).toEqual({
        ok: true,
        usageId: null,
        skipped: true,
        error: 'billing_amount_not_configured',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ignores non-positive RESERVE_AMOUNT fallback and skips without HTTP', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      vi.stubEnv('TEAMVER_BILLING_RESERVE_AMOUNT', '-5');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 0,
      });
      expect(result.ok).toBe(true);
      expect(result.usageId).toBeNull();
      expect(result.skipped).toBe(true);
      expect(result.error).toBe('billing_amount_not_configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('treats registry_not_configured BE response as ok without usage_id', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      vi.stubEnv('TEAMVER_BILLING_RESERVE_AMOUNT', '25');
      const fetchMock: FetchMock = vi.fn(async () =>
        jsonResponse(200, { ok: true, usage_id: null, error: 'registry_not_configured' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 0,
      });
      expect(result.ok).toBe(true);
      expect(result.usageId).toBeNull();
      expect(result.skipped).toBe(true);
    });

    it('emits teamver_usage_5xx marker on non-200 response', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock: FetchMock = vi.fn(async () =>
        jsonResponse(500, { ok: false, error: 'registry_500' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 5,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('http_500');
      const marker = findUsage5xxMarker(warnSpy, 'billing.reserve');
      expect(marker).not.toBeNull();
      expect(marker?.httpStatus).toBe(500);
    });

    it('emits teamver_usage_5xx marker on network error', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock: FetchMock = vi.fn(async () => {
        throw new Error('boom');
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 5,
      });
      expect(result.ok).toBe(false);
      const marker = findUsage5xxMarker(warnSpy, 'billing.reserve_throw');
      expect(marker).not.toBeNull();
      expect(marker?.error).toContain('boom');
    });

    it('skips when TEAMVER_BILLING_DISABLED=1 kill switch is set', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      vi.stubEnv('TEAMVER_BILLING_DISABLED', '1');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await reserveTeamverBillingFromDaemon({
        runId: 'run-1',
        identity,
        amount: 5,
      });
      expect(result.ok).toBe(true);
      expect(result.usageId).toBeNull();
      expect(result.skipped).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('commitTeamverBillingFromDaemon', () => {
    it('is a no-op without HTTP when usageId is empty', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const ok = await commitTeamverBillingFromDaemon({ runId: 'run-1', usageId: null });
      expect(ok).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts commit and returns true on 200/ok', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const fetchMock: FetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      const ok = await commitTeamverBillingFromDaemon({ runId: 'run-1', usageId: 'u-1' });
      expect(ok).toBe(true);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://design-api:16000/api/internal/billing/commit');
      expect(JSON.parse(String(init.body))).toEqual({ usage_id: 'u-1' });
    });

    it('emits teamver_usage_5xx marker when BE rejects commit', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock: FetchMock = vi.fn(async () =>
        jsonResponse(200, { ok: false, error: 'commit_failed' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const ok = await commitTeamverBillingFromDaemon({ runId: 'run-1', usageId: 'u-1' });
      expect(ok).toBe(false);
      const marker = findUsage5xxMarker(warnSpy, 'billing.commit');
      expect(marker).not.toBeNull();
      expect(marker?.usageId).toBe('u-1');
    });

    it('skips network when TEAMVER_BILLING_DISABLED=1 kill switch is set', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      vi.stubEnv('TEAMVER_BILLING_DISABLED', '1');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const ok = await commitTeamverBillingFromDaemon({ runId: 'run-1', usageId: 'u-1' });
      expect(ok).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('refundTeamverBillingFromDaemon', () => {
    it('forwards usage_id and reason on the wire', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const fetchMock: FetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      const ok = await refundTeamverBillingFromDaemon({
        runId: 'run-2',
        usageId: 'u-1',
        reason: 'design_run_canceled',
      });
      expect(ok).toBe(true);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://design-api:16000/api/internal/billing/refund');
      expect(JSON.parse(String(init.body))).toEqual({
        usage_id: 'u-1',
        reason: 'design_run_canceled',
      });
    });

    it('is a no-op without HTTP when usageId is empty', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const ok = await refundTeamverBillingFromDaemon({
        runId: 'run-2',
        usageId: '',
      });
      expect(ok).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('emits teamver_usage_5xx marker on refund network failure', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'k');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock: FetchMock = vi.fn(async () => {
        throw new Error('refund-boom');
      });
      vi.stubGlobal('fetch', fetchMock);

      const ok = await refundTeamverBillingFromDaemon({
        runId: 'run-2',
        usageId: 'u-1',
      });
      expect(ok).toBe(false);
      const marker = findUsage5xxMarker(warnSpy, 'billing.refund_throw');
      expect(marker).not.toBeNull();
      expect(marker?.error).toContain('refund-boom');
    });
  });
});
