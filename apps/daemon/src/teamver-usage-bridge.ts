import { TERMINAL_RUN_STATUSES } from './runs.js';
import { scanRunEventsForUsageAnalytics } from './run-analytics-observability.js';
import { teamverDesignApiBaseUrl } from './teamver-project-access.js';
import type { TeamverRequestIdentity } from './teamver-project-access.js';

type DaemonRunForUsage = {
  id: string;
  projectId?: string | null;
  status?: string;
  model?: string;
  teamverIdentity?: TeamverRequestIdentity | null;
  events: Array<{
    event: string;
    data: unknown;
  }>;
};

function teamverInternalApiKey(): string | null {
  const key = (process.env.TEAMVER_INTERNAL_API_KEY ?? '').trim();
  return key || null;
}

// Structured warn marker so the CloudWatch metric filter
// (`'"teamver_usage_5xx"'` literal in `print_cloudwatch_alarm_commands.sh`)
// catches usage-bridge failures alongside the billing-bridge ones.
// The billing bridge already emits the same shape with stage="billing.<phase>";
// here we use stage="usage.events" so operators can split the two via
// CloudWatch Logs Insights `$.stage`.
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

function shouldReportTeamverUsageFromDaemon(
  run: DaemonRunForUsage,
  persistedRunStatus?: string,
): boolean {
  if (!teamverDesignApiBaseUrl() || !teamverInternalApiKey()) return false;
  if (!run.teamverIdentity?.userId || !run.teamverIdentity?.workspaceId) return false;
  const status =
    (typeof persistedRunStatus === 'string' && persistedRunStatus.trim())
      ? persistedRunStatus.trim()
      : (typeof run.status === 'string' ? run.status : '');
  return TERMINAL_RUN_STATUSES.has(status);
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
        operation: 'design_run',
        project_id: run.projectId ?? null,
        run_id: run.id,
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
