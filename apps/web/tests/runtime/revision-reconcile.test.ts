// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { FileRevision } from '@open-design/contracts';
import { repairArtifactDocumentHead } from '@open-design/contracts';
import {
  classifyRevisionDiskReconcile,
  isExternalRevisionDiskConflict,
  isHeadDiskSyncLag,
  isUserViewingOlderRevision,
  shouldApplyHeadRevisionSnapshotAuthority,
  shouldPreserveCursorDuringDiskLag,
  shouldSkipDiskFastForwardDuringHistoryBrowse,
} from '../../src/runtime/revision-reconcile';

function revision(id: string, sequence: number): FileRevision {
  return {
    id,
    projectId: 'p',
    fileName: 'deck.html',
    parentRevisionId: null,
    sequence,
    createdAt: 0,
    byteSize: 10,
    source: 'manual_edit',
    label: id,
  };
}

describe('revision-reconcile', () => {
  const head = revision('rev-3', 3);
  const middle = revision('rev-2', 2);
  const cursor = revision('rev-1', 1);

  it('detects when the user is browsing older history', () => {
    expect(isUserViewingOlderRevision(1, head)).toBe(true);
    expect(isUserViewingOlderRevision(3, head)).toBe(false);
    expect(isUserViewingOlderRevision(undefined, head)).toBe(false);
  });

  it('treats head-matching disk as sync lag while cursor is older', () => {
    expect(isHeadDiskSyncLag(
      cursor,
      head,
      1,
      '<html>head</html>',
      '<html>older</html>',
      head,
    )).toBe(true);
    expect(isHeadDiskSyncLag(
      head,
      head,
      3,
      '<html>head</html>',
      '<html>head</html>',
      head,
    )).toBe(false);
    expect(isHeadDiskSyncLag(
      cursor,
      head,
      1,
      '<html>older</html>',
      '<html>older</html>',
      head,
    )).toBe(false);
  });

  it('preserves cursor preview when disk is stale during history browse', () => {
    expect(shouldPreserveCursorDuringDiskLag(
      cursor,
      head,
      1,
      '<html>older</html>',
      '<html>older</html>',
    )).toBe(true);
    expect(shouldPreserveCursorDuringDiskLag(
      cursor,
      head,
      1,
      '<html>head</html>',
      '<html>older</html>',
    )).toBe(false);
  });

  it('skips fast-forward when disk matches a newer revision during undo browse', () => {
    expect(shouldSkipDiskFastForwardDuringHistoryBrowse(cursor, head, head)).toBe(true);
    expect(shouldSkipDiskFastForwardDuringHistoryBrowse(cursor, head, middle)).toBe(true);
    expect(shouldSkipDiskFastForwardDuringHistoryBrowse(head, head, head)).toBe(false);
    expect(shouldSkipDiskFastForwardDuringHistoryBrowse(cursor, head, cursor)).toBe(false);
  });

  describe('classifyRevisionDiskReconcile', () => {
    it('returns cursor_matches_disk when bytes already align', () => {
      expect(classifyRevisionDiskReconcile({
        cursor,
        headRevision: head,
        activeSequence: 1,
        diskContent: '<html>older</html>',
        cursorSnapshotContent: '<html>older</html>',
        previewSource: '<html>older</html>',
        matchingRevision: null,
      })).toBe('cursor_matches_disk');
    });

    it('classifies stale head disk during undo as sync lag, not conflict', () => {
      expect(classifyRevisionDiskReconcile({
        cursor,
        headRevision: head,
        activeSequence: 1,
        diskContent: '<html>head</html>',
        cursorSnapshotContent: '<html>older</html>',
        previewSource: '<html>older</html>',
        matchingRevision: head,
      })).toBe('sync_lag_head_disk');
      expect(isExternalRevisionDiskConflict({
        cursor,
        headRevision: head,
        activeSequence: 1,
        diskContent: '<html>head</html>',
        cursorSnapshotContent: '<html>older</html>',
        previewSource: '<html>older</html>',
        matchingRevision: head,
      })).toBe(false);
    });

    it('preserves history cursor when preview matches but disk is ahead', () => {
      expect(classifyRevisionDiskReconcile({
        cursor,
        headRevision: head,
        activeSequence: 1,
        diskContent: '<html>head</html>',
        cursorSnapshotContent: '<html>older</html>',
        previewSource: '<html>older</html>',
        matchingRevision: null,
      })).toBe('preserve_history_cursor');
    });

    it('adopts disk when it matches a known revision at head without history browse', () => {
      expect(classifyRevisionDiskReconcile({
        cursor: head,
        headRevision: head,
        activeSequence: 3,
        diskContent: '<html>head</html>',
        cursorSnapshotContent: '<html>stale-snap</html>',
        previewSource: '<html>stale-snap</html>',
        matchingRevision: head,
      })).toBe('adopt_matching_disk');
    });

    it('preserves cursor when preview matches despite unknown disk bytes', () => {
      expect(classifyRevisionDiskReconcile({
        cursor: head,
        headRevision: head,
        activeSequence: 3,
        diskContent: '<html>external-edit</html>',
        cursorSnapshotContent: '<html>head</html>',
        previewSource: '<html>head</html>',
        matchingRevision: null,
      })).toBe('preserve_history_cursor');
      expect(isExternalRevisionDiskConflict({
        cursor: head,
        headRevision: head,
        activeSequence: 3,
        diskContent: '<html>external-edit</html>',
        cursorSnapshotContent: '<html>head</html>',
        previewSource: '<html>head</html>',
        matchingRevision: null,
      })).toBe(false);
    });

    it('flags true external conflict when disk is unknown and preview diverged', () => {
      expect(classifyRevisionDiskReconcile({
        cursor: head,
        headRevision: head,
        activeSequence: 3,
        diskContent: '<html>external-edit</html>',
        cursorSnapshotContent: '<html>head</html>',
        previewSource: '<html>also-external</html>',
        matchingRevision: null,
      })).toBe('external_conflict');
      expect(isExternalRevisionDiskConflict({
        cursor: head,
        headRevision: head,
        activeSequence: 3,
        diskContent: '<html>external-edit</html>',
        cursorSnapshotContent: '<html>head</html>',
        previewSource: '<html>also-external</html>',
        matchingRevision: null,
      })).toBe(true);
    });

    it('does not treat unknown disk as sync lag when head snapshot authority does not apply', () => {
      expect(shouldApplyHeadRevisionSnapshotAuthority(
        head,
        head,
        true,
        '<html>external-edit</html>',
        '<html>head</html>',
        null,
      )).toBe(false);
    });

    it('applies head snapshot authority only when disk still reflects an older revision', () => {
      expect(shouldApplyHeadRevisionSnapshotAuthority(
        head,
        head,
        true,
        '<html>older</html>',
        '<html>head</html>',
        cursor,
      )).toBe(true);
      expect(shouldApplyHeadRevisionSnapshotAuthority(
        head,
        head,
        true,
        '<html>external-edit</html>',
        '<html>head</html>',
        null,
      )).toBe(false);
    });

    it('adopts disk when it matches an older known revision while cursor is still at head', () => {
      expect(classifyRevisionDiskReconcile({
        cursor: head,
        headRevision: head,
        activeSequence: 3,
        diskContent: '<html>older</html>',
        cursorSnapshotContent: '<html>head</html>',
        previewSource: '<html>head</html>',
        matchingRevision: cursor,
      })).toBe('adopt_matching_disk');
      expect(isExternalRevisionDiskConflict({
        cursor: head,
        headRevision: head,
        activeSequence: 3,
        diskContent: '<html>older</html>',
        cursorSnapshotContent: '<html>head</html>',
        previewSource: '<html>head</html>',
        matchingRevision: cursor,
      })).toBe(false);
    });

    it('treats repaired disk bytes as matching the cursor snapshot', () => {
      const corrupt = '<html><head>viewport=width=device-width, initial-scale=1" /><title>Deck</title></head><body>Hi</body></html>';
      const canonical = repairArtifactDocumentHead(corrupt);
      expect(classifyRevisionDiskReconcile({
        cursor: head,
        headRevision: head,
        activeSequence: 3,
        diskContent: corrupt,
        cursorSnapshotContent: canonical,
        previewSource: canonical,
        matchingRevision: null,
      })).toBe('cursor_matches_disk');
    });
  });
});
