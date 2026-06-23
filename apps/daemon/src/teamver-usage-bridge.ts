import { TERMINAL_RUN_STATUSES } from './runs.js';
import { scanRunEventsForUsageAnalytics } from './run-analytics-observability.js';
import { teamverBillingDisabled } from './teamver-billing-bridge.js';
import { teamverDesignApiBaseUrl } from './teamver-project-access.js';
import type { TeamverRequestIdentity } from './teamver-project-access.js';

type DaemonRunForUsage = {
  id: string;
  projectId?: string | null;
  status?: string;
  model?: string;
  teamverIdentity?: TeamverRequestIdentity | null;
  teamverBillingUsageId?: string | null;
  events: Array<{
    event: string;
    data: unknown;
  }>;
};

function teamverInternalApiKey(): string | null {
  const key = (process.env.TEAMVER_INTERNAL_API_KEY ?? '').trim();
  return key || null;
}

function emitUsage5xxMarker(stage: string, fields: Record<string, unknown>): void {
  try {
    console.warn(
      JSON.stringify({
        metric: 'teamver_usage_5xx',
        stage,
        ts: Date.now(),
        ...fields,
      }),
    );
  } catch {
    // structured warn must never bubble — usage report is best-effort.
  }
}

function resolvePersistedRunStatus(
  run: DaemonRunForUsage,
  persistedRunStatus?: string,
): string {
  const status =
    (typeof persistedRunStatus === 'string' && persistedRunStatus.trim())
      ? persistedRunStatus.trim()
      : (typeof run.status === 'string' ? run.status : '');
  return status;
}

function resolveBillingSnapshot(run: DaemonRunForUsage): {
  registry_usage_id: string | null;
  billing_status: string;
  credits_committed: boolean;
} {
  if (teamverBillingDisabled()) {
    return {
      registry_usage_id: null,
      billing_status: 'disabled',
      credits_committed: false,
    };
  }
  const usageId = (run.teamverBillingUsageId ?? '').trim() || null;
  if (!usageId) {
    return {
      registry_usage_id: null,
      billing_status: 'not_configured',
      credits_committed: false,
    };
  }
  return {
    registry_usage_id: usageId,
    billing_status: 'reserved',
    credits_committed: false,
  };
}

function shouldReportTeamverUsageFromDaemon(
  run: DaemonRunForUsage,
  persistedRunStatus?: string,
): boolean {
  if (!teamverDesignApiBaseUrl() || !teamverInternalApiKey()) return false;
  if (!run.teamverIdentity?.userId || !run.teamverIdentity?.workspaceId) return false;
  return TERMINAL_RUN_STATUSES.has(resolvePersistedRunStatus(run, persistedRunStatus));
}

export async function reportTeamverUsageFromDaemon({
  run,
  persistedRunStatus,
  reportedRuns,
}: {
  run: DaemonRunForUsage;
  persistedRunStatus?: string;
  reportedRuns?: Set<string>;
}): Promise<void> {
  if (!shouldReportTeamverUsageFromDaemon(run, persistedRunStatus)) return;

  const dedupeKey = `usage:${run.id}`;
  if (reportedRuns?.has(dedupeKey)) return;
  reportedRuns?.add(dedupeKey);

  const usage = scanRunEventsForUsageAnalytics(run.events, run.model, 0);
  const modelName =
    usage.agent_reported_model ??
    (typeof run.model === 'string' && run.model.trim() ? run.model.trim() : 'unknown');
  const billing = resolveBillingSnapshot(run);
  const runStatus = resolvePersistedRunStatus(run, persistedRunStatus);

  const baseUrl = teamverDesignApiBaseUrl();
  const apiKey = teamverInternalApiKey();
  if (!baseUrl || !apiKey) return;

  const identity = run.teamverIdentity!;
  try {
    const response = await fetch(`${baseUrl}/api/internal/usage/events`, {
      method: 'POST',
      headers: {
        'X-Teamver-Internal-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: identity.userId,
        workspace_id: identity.workspaceId,
        model_name: modelName,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        total_tokens: usage.total_tokens ?? null,
        operation: 'design_run',
        project_id: run.projectId ?? null,
        run_id: run.id,
        run_status: runStatus || null,
        token_count_source: usage.token_count_source ?? 'unknown',
        registry_usage_id: billing.registry_usage_id,
        billing_status: billing.billing_status,
        credits_committed: billing.credits_committed,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 200);
      emitUsage5xxMarker('usage.events', {
        runId: run.id,
        workspaceId: identity.workspaceId,
        projectId: run.projectId ?? null,
        modelName,
        httpStatus: response.status,
        body,
      });
    }
  } catch (err) {
    emitUsage5xxMarker('usage.events', {
      runId: run.id,
      workspaceId: identity.workspaceId,
      projectId: run.projectId ?? null,
      modelName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function finalizeTeamverUsageBillingFromDaemon(args: {
  runId: string;
  workspaceId: string;
  billingStatus: 'committed' | 'refunded' | 'commit_failed' | 'refund_failed';
  creditsCommitted: boolean;
  registryUsageId?: string | null;
}): Promise<void> {
  const baseUrl = teamverDesignApiBaseUrl();
  const apiKey = teamverInternalApiKey();
  const runId = args.runId.trim();
  const workspaceId = args.workspaceId.trim();
  if (!baseUrl || !apiKey || !runId || !workspaceId) return;

  try {
    const response = await fetch(`${baseUrl}/api/internal/usage/billing-finalize`, {
      method: 'POST',
      headers: {
        'X-Teamver-Internal-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        run_id: runId,
        billing_status: args.billingStatus,
        credits_committed: args.creditsCommitted,
        registry_usage_id: args.registryUsageId ?? null,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      emitUsage5xxMarker('usage.billing_finalize', {
        runId,
        workspaceId,
        billingStatus: args.billingStatus,
        httpStatus: response.status,
      });
    }
  } catch (err) {
    emitUsage5xxMarker('usage.billing_finalize', {
      runId,
      workspaceId,
      billingStatus: args.billingStatus,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
