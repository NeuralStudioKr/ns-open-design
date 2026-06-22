import { describe, expect, it } from 'vitest';
import type { ChatRunStatusResponse } from '@open-design/contracts';

import {
  buildActiveRunSummaries,
  buildPetTaskCenter,
} from '../src/components/pet/taskCenter';
import type { Project } from '../src/types';

const projects: Project[] = [
  { id: 'p1', name: 'Landing Page', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 },
  { id: 'p2', name: 'Brand Deck', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 },
];

function run(
  id: string,
  projectId: string,
  status: ChatRunStatusResponse['status'],
  updatedAt: number,
): ChatRunStatusResponse {
  return {
    id,
    projectId,
    conversationId: null,
    assistantMessageId: null,
    agentId: null,
    status,
    createdAt: updatedAt - 10,
    updatedAt,
  };
}

describe('buildActiveRunSummaries', () => {
  it('returns queued and running summaries only', () => {
    const summaries = buildActiveRunSummaries(projects, [
      run('r1', 'p1', 'running', 10),
      run('q1', 'p2', 'queued', 11),
      run('done', 'p1', 'succeeded', 20),
    ]);

    expect(summaries).toEqual([
      { projectId: 'p1', projectName: 'Landing Page', status: 'running', count: 1 },
      { projectId: 'p2', projectName: 'Brand Deck', status: 'queued', count: 1 },
    ]);
    expect(buildPetTaskCenter(projects, []).recent).toEqual([]);
  });
});
