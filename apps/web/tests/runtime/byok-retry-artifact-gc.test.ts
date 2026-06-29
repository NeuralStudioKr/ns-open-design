import { describe, expect, it, vi } from 'vitest';

import {
  BYOK_PNG_FILENAME_PATTERN,
  collectByokRetryGarbageFileNames,
  cleanupByokRetryArtifacts,
} from '../../src/runtime/byok-retry-artifact-gc';
import type { ChatMessage } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  deleteProjectFile: vi.fn(async () => true),
}));

import { deleteProjectFile } from '../../src/providers/registry';

describe('byok-retry-artifact-gc', () => {
  const failedAssistant: ChatMessage = {
    id: 'assistant-fail',
    role: 'assistant',
    content: 'See /api/projects/p1/files/byok-abc.png',
    createdAt: 1,
    runStatus: 'failed',
    preTurnFileNames: ['index.html'],
  };

  it('matches BYOK png filenames', () => {
    expect(BYOK_PNG_FILENAME_PATTERN.test('byok-m3abc.png')).toBe(true);
    expect(BYOK_PNG_FILENAME_PATTERN.test('index.html')).toBe(false);
  });

  it('collects byok png files created after the failed turn snapshot', () => {
    const names = collectByokRetryGarbageFileNames(
      [
        { name: 'index.html' },
        { name: 'byok-old.png' },
        { name: 'byok-new.png' },
      ],
      {
        ...failedAssistant,
        content: '',
        preTurnFileNames: ['index.html', 'byok-old.png'],
      },
    );
    expect(names).toEqual(['byok-new.png']);
  });

  it('includes filenames referenced in assistant content', () => {
    const names = collectByokRetryGarbageFileNames([], failedAssistant);
    expect(names).toEqual(['byok-abc.png']);
  });

  it('deletes collected artifacts best-effort', async () => {
    const deleted = await cleanupByokRetryArtifacts('p1', [{ name: 'byok-new.png' }], {
      ...failedAssistant,
      content: '',
      preTurnFileNames: [],
    });
    expect(deleted).toEqual(['byok-new.png']);
    expect(deleteProjectFile).toHaveBeenCalledWith('p1', 'byok-new.png');
  });
});
