import type { ChatRunStatus } from '@open-design/contracts';

import { OdDaemonClient } from './daemon-client.js';
import type {
  GenerateDesignArtifactInput,
  GenerateDesignArtifactResult,
  OdDaemonClientOptions,
} from './types.js';

/**
 * Headless orchestration for Teamver design-app BE.
 * Drive upload and Teamver SDK calls belong in the wrapper layer (teamver-design-app).
 */
export async function generateDesignArtifact(
  input: GenerateDesignArtifactInput,
  clientOptions: OdDaemonClientOptions = {},
): Promise<GenerateDesignArtifactResult> {
  const client = new OdDaemonClient(clientOptions);
  await client.assertOperational();

  const projectName =
    input.projectName ??
    `Design run — ${new Date().toISOString().slice(0, 10)}`;

  const created = await client.createProject({
    name: projectName,
    skillId: input.skillId ?? null,
    designSystemId: input.designSystemId ?? null,
    pendingPrompt: input.prompt,
    conversationMode: 'design',
    skipDiscoveryBrief: true,
  });

  const projectId = created.project.id;
  const run = await client.createRun({
    projectId,
    message: input.prompt,
    ...(input.skillId ? { skillId: input.skillId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
  });

  const terminal = await client.waitForRun(run.runId);
  let exportManifest = null;
  if (terminal.status === 'succeeded') {
    try {
      exportManifest = await client.getExportManifest(projectId);
    } catch {
      exportManifest = null;
    }
  }

  return {
    projectId,
    runId: run.runId,
    conversationId: run.conversationId ?? terminal.conversationId ?? null,
    status: terminal.status as ChatRunStatus,
    exportManifest,
  };
}
