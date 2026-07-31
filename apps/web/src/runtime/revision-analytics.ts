import type {
  RevisionPushProps,
  RevisionRedoProps,
  RevisionRestoreProps,
  RevisionUndoProps,
  TrackingProjectKind,
  TrackingRevisionArea,
} from '@open-design/contracts/analytics';
import type { FileRevision } from '@open-design/contracts';
import {
  trackRevisionPush,
  trackRevisionRedo,
  trackRevisionRestore,
  trackRevisionUndo,
} from '../analytics/events';

type RevisionAnalyticsTrack = Parameters<typeof trackRevisionPush>[0];

function baseRevisionProps(
  projectId: string,
  projectKind: TrackingProjectKind | null,
  fileName: string,
  revision: Pick<FileRevision, 'id' | 'source' | 'sequence'>,
  area: TrackingRevisionArea,
): Omit<RevisionPushProps, 'page_name'> {
  return {
    area,
    project_id: projectId,
    project_kind: projectKind,
    file_name: fileName,
    revision_id: revision.id,
    revision_source: revision.source,
    revision_sequence: revision.sequence,
  };
}

export function emitRevisionPush(
  track: RevisionAnalyticsTrack,
  projectId: string,
  projectKind: TrackingProjectKind | null,
  fileName: string,
  revision: FileRevision,
  area: TrackingRevisionArea,
): void {
  trackRevisionPush(track, {
    page_name: 'artifact',
    ...baseRevisionProps(projectId, projectKind, fileName, revision, area),
  });
}

export function emitRevisionUndo(
  track: RevisionAnalyticsTrack,
  projectId: string,
  projectKind: TrackingProjectKind | null,
  fileName: string,
  revision: FileRevision,
  area: TrackingRevisionArea = 'revision_toolbar',
): void {
  trackRevisionUndo(track, {
    page_name: 'artifact',
    ...baseRevisionProps(projectId, projectKind, fileName, revision, area),
  } as RevisionUndoProps);
}

export function emitRevisionRedo(
  track: RevisionAnalyticsTrack,
  projectId: string,
  projectKind: TrackingProjectKind | null,
  fileName: string,
  revision: FileRevision,
  area: TrackingRevisionArea = 'revision_toolbar',
): void {
  trackRevisionRedo(track, {
    page_name: 'artifact',
    ...baseRevisionProps(projectId, projectKind, fileName, revision, area),
  } as RevisionRedoProps);
}

export function emitRevisionRestore(
  track: RevisionAnalyticsTrack,
  projectId: string,
  projectKind: TrackingProjectKind | null,
  fileName: string,
  revision: FileRevision,
  area: TrackingRevisionArea = 'revision_history',
): void {
  trackRevisionRestore(track, {
    page_name: 'artifact',
    ...baseRevisionProps(projectId, projectKind, fileName, revision, area),
  } as RevisionRestoreProps);
}
