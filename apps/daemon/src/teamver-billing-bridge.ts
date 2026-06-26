// Daemon → design-api `/api/internal/billing/{reserve,commit,refund}` bridge.
//
// Mirrors `teamver-usage-bridge.ts`. Bridge for Registry Phase 2 wiring
// (docs-teamver/04 A9, docs-teamver/11 §B-1):
//   - `reserveTeamverBillingFromDaemon` is called at chat run start;
//     callers persist the returned `usageId` on the run object as
//     `run.teamverBillingUsageId` so the terminal hook can finalize.
//   - `commitTeamverBillingFromDaemon` runs on terminal `succeeded`.
//   - `refundTeamverBillingFromDaemon` runs on `failed` / `canceled`.
//
// Env knobs:
//   - `TEAMVER_BILLING_DISABLED=1`        — kill switch, all calls no-op.
//   - `TEAMVER_BILLING_RESERVE_AMOUNT=N`  — fallback amount when caller
//     passes amount==0 (positive int; invalid/NaN/non-positive skips billing).
//   - `TEAMVER_BILLING_TIMEOUT_MS=ms`     — override HTTP timeout
//     (clamped to 100..30000; default 5000).
//
// The bridge stays a no-op (returns `ok=true, usageId=null, skipped=true`) when:
//   - `TEAMVER_BILLING_DISABLED=1`, or
//   - `TEAMVER_DESIGN_API_URL` is unset (standalone OD), or
//   - `TEAMVER_INTERNAL_API_KEY` is unset, or
//   - the design-api orchestrator skipped reserve because registry creds
//     (`TEAMVER_REGISTRY_*`) are absent on the BE side.
//
// Failures degrade — never throw. Each failure emits a structured
// `teamver_usage_5xx` JSON marker so the CloudWatch log metric filter
// (see `print_cloudwatch_alarm_commands.sh`) picks it up.

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

function billingDisabledByKillSwitch(): boolean {
  return (process.env.TEAMVER_BILLING_DISABLED ?? '').trim() === '1';
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

function reserveAmountEnvFallback(): number | null {
  const raw = (process.env.TEAMVER_BILLING_RESERVE_AMOUNT ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return Math.floor(parsed);
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
  const fallback = reserveAmountEnvFallback();
  return fallback ?? 0;
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
