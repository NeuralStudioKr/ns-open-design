// Daemon → design-api billing bridge (0918-N07-2).
//
// Run start uses `estimate-reserve` as a 0-balance gate. Policies:
//   billing_disabled | billing_deferred | insufficient_balance | balance_unavailable
// A positive estimate amount is not used for a full-amount reserve.
// `TEAMVER_BILLING_RESERVE_AMOUNT` must not fire.
//
// Legacy reserve/commit/refund stay for leftover usage_id only. New runs
// enqueue on design-api and drain via Main M2M consume.
//
// Env knobs:
//   - `TEAMVER_BILLING_DISABLED` — kill switch (1/true/yes/on), all calls no-op.
//   - `TEAMVER_BILLING_TIMEOUT_MS` — HTTP timeout (100..30000; default 5000).

import { teamverDesignApiBaseUrl } from './teamver-project-access.js';
import type { TeamverRequestIdentity } from './teamver-project-access.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;

export type ReserveTeamverBillingArgs = {
  runId: string;
  identity: TeamverRequestIdentity | null | undefined;
  amount: number;
  reason?: string;
};

export type ReserveTeamverBillingResult = {
  ok: boolean;
  usageId: string | null;
  skipped?: boolean;
  error?: string;
};

function teamverInternalApiKey(): string | null {
  const key = (process.env.TEAMVER_INTERNAL_API_KEY ?? '').trim();
  return key || null;
}

/** Mirrors design-api ``_env_bool("TEAMVER_BILLING_DISABLED")``. */
function billingDisabledByKillSwitch(): boolean {
  const v = (process.env.TEAMVER_BILLING_DISABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function teamverBillingDisabled(): boolean {
  return billingDisabledByKillSwitch();
}

function billingEnv(): { baseUrl: string; apiKey: string } | null {
  if (billingDisabledByKillSwitch()) return null;
  const baseUrl = teamverDesignApiBaseUrl();
  const apiKey = teamverInternalApiKey();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

function billingTimeoutMs(): number {
  const raw = (process.env.TEAMVER_BILLING_TIMEOUT_MS ?? '').trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.floor(parsed)));
}

function emitUsage5xxMarker(stage: string, fields: Record<string, unknown>): void {
  try {
    console.warn(
      JSON.stringify({
        metric: 'teamver_usage_5xx',
        stage,
        ...fields,
      }),
    );
  } catch {
    // Defensive: payload contains values that JSON.stringify cannot serialize
    // (e.g. circular). Fall back to a plain message so we never break the run.
    console.warn(`teamver_usage_5xx stage=${stage}`);
  }
}

async function postJson<T>(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; payload: T | null }> {
  const attempt = async (): Promise<{ status: number; payload: T | null }> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Teamver-Internal-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await response.text().catch(() => '');
    let payload: T | null = null;
    if (raw) {
      try {
        payload = JSON.parse(raw) as T;
      } catch {
        payload = null;
      }
    }
    return { status: response.status, payload };
  };

  let result = await attempt();
  if (result.status >= 500 || result.status === 429) {
    result = await attempt();
  }
  return result;
}

function resolveReserveAmount(callerAmount: number): number | null {
  if (!Number.isFinite(callerAmount) || callerAmount < 0) return null;
  if (callerAmount > 0) return Math.floor(callerAmount);
  return 0;
}

export type ResolveTeamverBillingReserveAmountResult = {
  amount: number;
  billingWired: boolean;
  estimateUnavailable: boolean;
  policy?: string;
};

export async function resolveTeamverBillingReserveAmountFromDaemon(args: {
  modelName?: string | null;
  workspaceId?: string | null;
}): Promise<ResolveTeamverBillingReserveAmountResult> {
  const env = billingEnv();
  if (!env) {
    return { amount: 0, billingWired: false, estimateUnavailable: false, policy: 'billing_disabled' };
  }

  const modelName = (args.modelName ?? '').trim() || 'default';
  const workspaceId = (args.workspaceId ?? '').trim();

  try {
    const { status, payload } = await postJson<{
      amount_t?: number;
      policy?: string;
    }>(
      `${env.baseUrl}/api/internal/billing/estimate-reserve`,
      env.apiKey,
      { model_name: modelName, ...(workspaceId ? { workspace_id: workspaceId } : {}) },
      billingTimeoutMs(),
    );
    if (status !== 200 || !payload) {
      return { amount: 0, billingWired: true, estimateUnavailable: true, policy: 'balance_unavailable' };
    }
    const policy = String(payload.policy || '').trim();
    if (policy === 'insufficient_balance' || policy === 'balance_unavailable') {
      return {
        amount: 0,
        billingWired: true,
        estimateUnavailable: policy === 'balance_unavailable',
        policy,
      };
    }
    if (policy === 'billing_disabled' || policy === 'billing_deferred') {
      return { amount: 0, billingWired: true, estimateUnavailable: false, policy };
    }
    const amount = Number(payload.amount_t);
    if (!Number.isFinite(amount) || amount < 0) {
      return { amount: 0, billingWired: true, estimateUnavailable: true, policy: policy || 'balance_unavailable' };
    }
    if (amount === 0) {
      return { amount: 0, billingWired: true, estimateUnavailable: false, policy: policy || 'billing_deferred' };
    }
    return { amount: Math.floor(amount), billingWired: true, estimateUnavailable: false, policy: policy || 'metered' };
  } catch {
    return { amount: 0, billingWired: true, estimateUnavailable: true, policy: 'balance_unavailable' };
  }
}

export async function reserveTeamverBillingFromDaemon(
  args: ReserveTeamverBillingArgs,
): Promise<ReserveTeamverBillingResult> {
  const runId = (args.runId ?? '').trim();
  if (!runId) return { ok: false, usageId: null, error: 'missing_run_id' };

  const workspaceId = (args.identity?.workspaceId ?? '').trim();
  if (!workspaceId) return { ok: true, usageId: null, skipped: true };

  const amount = resolveReserveAmount(args.amount);
  if (amount === null) {
    return { ok: false, usageId: null, error: 'invalid_amount' };
  }
  if (amount <= 0) {
    return { ok: true, usageId: null, skipped: true, error: 'billing_amount_not_configured' };
  }

  const env = billingEnv();
  if (!env) return { ok: true, usageId: null, skipped: true };

  try {
    const { status, payload } = await postJson<{
      ok?: boolean;
      usage_id?: string | null;
      error?: string | null;
    }>(
      `${env.baseUrl}/api/internal/billing/reserve`,
      env.apiKey,
      {
        workspace_id: workspaceId,
        amount,
        reason: args.reason ?? 'design_run',
      },
      billingTimeoutMs(),
    );
    if (status !== 200 || !payload) {
      emitUsage5xxMarker('billing.reserve', {
        runId,
        workspaceId,
        amount,
        httpStatus: status,
      });
      return { ok: false, usageId: null, error: `http_${status}` };
    }
    if (payload.ok !== true) {
      const beError = (payload.error ?? '').toString();
      // BE returns ok=true with usage_id=null for "registry_not_configured" —
      // that's the documented no-op path and lands above. ok=false here means
      // a real BE error worth alarming on.
      emitUsage5xxMarker('billing.reserve_not_ok', {
        runId,
        workspaceId,
        amount,
        beError: beError || 'reserve_not_ok',
      });
      return {
        ok: false,
        usageId: null,
        error: beError || 'reserve_not_ok',
      };
    }
    const usageId = (payload.usage_id ?? '').toString().trim() || null;
    return { ok: true, usageId, skipped: !usageId };
  } catch (err) {
    emitUsage5xxMarker('billing.reserve_throw', {
      runId,
      workspaceId,
      amount,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, usageId: null, error: String(err) };
  }
}

async function postLifecycle(
  endpoint: 'commit' | 'refund',
  body: { usage_id: string; reason?: string },
  context: { runId: string; usageId: string },
): Promise<boolean> {
  // Kill switch with a real usage_id must NOT report success — callers would
  // stamp ledger `committed`/`refunded` while Registry still holds reserved.
  if (billingDisabledByKillSwitch()) {
    emitUsage5xxMarker(`billing.${endpoint}_disabled_orphan`, {
      runId: context.runId,
      usageId: context.usageId,
    });
    return false;
  }
  const env = billingEnv();
  if (!env) return true;
  try {
    const { status, payload } = await postJson<{ ok?: boolean; error?: string | null }>(
      `${env.baseUrl}/api/internal/billing/${endpoint}`,
      env.apiKey,
      body,
      billingTimeoutMs(),
    );
    if (status !== 200 || !payload || payload.ok !== true) {
      emitUsage5xxMarker(`billing.${endpoint}`, {
        runId: context.runId,
        usageId: context.usageId,
        httpStatus: status,
        beError: (payload?.error ?? '').toString() || `http_${status}`,
      });
      return false;
    }
    return true;
  } catch (err) {
    emitUsage5xxMarker(`billing.${endpoint}_throw`, {
      runId: context.runId,
      usageId: context.usageId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function commitTeamverBillingFromDaemon(args: {
  runId: string;
  usageId: string | null | undefined;
}): Promise<boolean> {
  const runId = (args.runId ?? '').trim();
  const usageId = (args.usageId ?? '').toString().trim();
  if (!usageId) return true;
  return await postLifecycle('commit', { usage_id: usageId }, { runId, usageId });
}

export async function refundTeamverBillingFromDaemon(args: {
  runId: string;
  usageId: string | null | undefined;
  reason?: string;
}): Promise<boolean> {
  const runId = (args.runId ?? '').trim();
  const usageId = (args.usageId ?? '').toString().trim();
  if (!usageId) return true;
  return await postLifecycle(
    'refund',
    { usage_id: usageId, reason: args.reason ?? 'design_run_failed' },
    { runId, usageId },
  );
}
