import { describe, expect, it } from 'vitest';
import { isProjectScratchSyncExcludedRelpath } from '../src/storage/project-scratch-sync-exclude.js';

describe('isProjectScratchSyncExcludedRelpath', () => {
  it('excludes daemon state and revision snapshots', () => {
    expect(isProjectScratchSyncExcludedRelpath('_daemon/project-state.v1.json')).toBe(true);
    expect(isProjectScratchSyncExcludedRelpath('.od/revisions/deck.html/rev-1.snap.gz')).toBe(true);
    expect(isProjectScratchSyncExcludedRelpath('deck.html')).toBe(false);
    expect(isProjectScratchSyncExcludedRelpath('assets/logo.png')).toBe(false);
  });
});
