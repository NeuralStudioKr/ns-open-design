import { getDesignBffClient } from "./designBffClient";

export type TeamverUsageEvent = {
  workspace_id: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  operation?: string;
  project_id?: string;
  run_id?: string;
};

export async function reportTeamverDesignUsage(event: TeamverUsageEvent): Promise<void> {
  const client = getDesignBffClient();
  if (!client) return;

  try {
    await client.http.post(
      "/usage/events",
      {
        workspaceId: event.workspace_id,
        modelName: event.model_name,
        inputTokens: event.input_tokens,
        outputTokens: event.output_tokens,
        operation: event.operation ?? "design_run",
        projectId: event.project_id,
        runId: event.run_id,
      },
      {
        workspaceId: event.workspace_id,
        skipAuthHeader: true,
        skipAuthRecovery: true,
      },
    );
  } catch (err) {
    console.warn("[teamver] usage/events failed", err);
  }
}
