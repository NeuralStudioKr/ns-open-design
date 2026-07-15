import { describe, expect, it } from 'vitest';
import type { ChatRunStatusResponse } from '@open-design/contracts';

import {
  buildActiveRunSummaries,
  buildPetTaskCenter,
  primaryConversationIdForProject,
  activeRunSummariesEqual,
  buildActiveRunSignature,
} from '../src/components/pet/taskCenter';
import type { Project } from '../src/types';

const projects: Project[] = [
  {
    id: 'p1',
    name: 'Landing Page',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 1,
    metadata: { kind: 'deck', entryFile: 'output/deck.html' },
  },
  { id: 'p2', name: 'Brand Deck', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 },
];

function run(
  id: string,
  projectId: string,
  status: ChatRunStatusResponse['status'],
  updatedAt: number,
  conversationId: string | null = null,
): ChatRunStatusResponse {
  return {
    id,
    projectId,
    conversationId,
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
      {
        projectId: 'p1',
        projectName: 'Landing Page',
        status: 'running',
        count: 1,
        conversationId: null,
        previewFileName: 'deck.html',
      },
      { projectId: 'p2', projectName: 'Brand Deck', status: 'queued', count: 1, conversationId: null },
    ]);
    expect(buildPetTaskCenter(projects, []).recent).toEqual([]);
  });

  it('attaches primary conversationId for embed background-run deep-link', () => {
    const summaries = buildActiveRunSummaries(projects, [
      run('r1', 'p1', 'running', 10, 'conv-a'),
      run('q1', 'p2', 'queued', 11, 'conv-b'),
    ]);

    expect(summaries[0]?.conversationId).toBe('conv-a');
    expect(summaries[1]?.conversationId).toBe('conv-b');
  });

  it('prefers running conversation over newer queued on the same project', () => {
    const id = primaryConversationIdForProject(
      [
        run('q1', 'p1', 'queued', 20, 'conv-queued'),
        run('r1', 'p1', 'running', 10, 'conv-running'),
      ],
      'p1',
    );
    expect(id).toBe('conv-running');
  });

  it('treats previewFileName changes as unequal for banner refresh', () => {
    const base = [
      {
        projectId: 'p1',
        projectName: 'Landing Page',
        status: 'running' as const,
        count: 1,
        conversationId: 'conv-a',
        previewFileName: 'deck.html',
      },
    ];
    const withoutPreview = [{ ...base[0]!, previewFileName: undefined }];
    expect(activeRunSummariesEqual(base, withoutPreview)).toBe(false);
    expect(activeRunSummariesEqual(base, [{ ...base[0]! }])).toBe(true);
  });

  it('includes session-active runs when project list is empty', () => {
    const summaries = buildActiveRunSummaries([], [
      run('r1', 'p-deep', 'running', 10, 'conv-a'),
    ], new Set(['p-deep']));

    expect(summaries).toEqual([
      {
        projectId: 'p-deep',
        projectName: 'teamver Design',
        status: 'running',
        count: 1,
        conversationId: 'conv-a',
      },
    ]);
  });

  it('buildActiveRunSignature includes preview and rename fields', () => {
    const summaries = [
      {
        projectId: 'p1',
        projectName: 'Deck A',
        status: 'running' as const,
        count: 1,
        conversationId: 'conv-a',
        previewFileName: 'deck.html',
      },
    ];
    expect(buildActiveRunSignature(summaries)).toBe(
      'p1:Deck A:running:1:conv-a:deck.html',
    );
    const renamed = [{ ...summaries[0]!, projectName: 'Deck B' }];
    expect(buildActiveRunSignature(renamed)).not.toBe(buildActiveRunSignature(summaries));
  });
});
