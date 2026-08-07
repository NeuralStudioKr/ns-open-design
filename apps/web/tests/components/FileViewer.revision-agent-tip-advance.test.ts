import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fileViewer = readFileSync(join(here, '../../src/components/FileViewer.tsx'), 'utf8');
const projectView = readFileSync(join(here, '../../src/components/ProjectView.tsx'), 'utf8');

describe('FileViewer revision tip advance after undo', () => {
  it('paints target revision HTML and freeze when activeSequence moves the cursor', () => {
    const start = fileViewer.indexOf('const refreshRevisionStack = useCallback');
    expect(start).toBeGreaterThan(0);
    const block = fileViewer.slice(start, start + 5_500);
    expect(block).toContain('resolveRevisionCursorId');
    expect(block).toContain('getActiveRevisionSequence');
    expect(block).toContain('cursorMovedByActiveSequence');
    expect(block).toContain('manualEditPinnedSourceRef.current = null');
    expect(block).toContain('resolveRevisionSnapshotContent');
    expect(block).toContain('setManualEditFrozenSource');
    expect(block).toContain('activeMissingFromList');
    expect(block).toContain('revisionRefreshGenerationRef');
    // Tip advance with identical HTML skips setSource/ref/gate + freeze remount /
    // reloadKey / repair-cache / draft churn.
    expect(block).toContain('contentUnchanged');
    expect(block).toContain('if (!contentUnchanged)');
    expect(block).toContain('rememberStablePreviewSource(projectId, file.name, targetHtml)');
    const unchangedGuard = block.indexOf('if (!contentUnchanged)');
    expect(unchangedGuard).toBeGreaterThan(0);
    expect(block.indexOf('rememberStablePreviewSource(projectId, file.name, targetHtml)')).toBeGreaterThan(
      unchangedGuard,
    );
    expect(block.indexOf('setSource(targetHtml)')).toBeGreaterThan(unchangedGuard);
    // Unchanged branch syncs drifted freeze/gate/stable via refs (not stale state).
    expect(block).toContain('manualEditFrozenSourceRef.current !== targetHtml');
    expect(block).toContain('lastStablePreviewSourceRef.current !== targetHtml');
    expect(block).toContain('exportHtmlSnapshotGateRef.current !== targetHtml');
    expect(block).toContain('current.fullSource === targetHtml');
    expect(block).not.toContain('hydratedUndoCursorFromSession');
    // liveHtml mount shares one intact-gated repair across source/stable/paints.
    expect(fileViewer).toContain('initialLiveHtmlRepaired');
    expect(fileViewer).toContain('repairArtifactDocumentHeadIfNeeded');
    expect(fileViewer).toContain('readCachedPreviewSource');
    expect(fileViewer).toContain('rememberStablePreviewSource');
    expect(fileViewer).toContain('acceptPreviewHtmlCandidate');
    // remove-element remaining multi-select shares one Document.
    expect(fileViewer).toContain('One Document for remaining multi-select inspector after remove');
    expect(fileViewer).toContain('remainingDoc');
    // remove-element 2→1 seeds inspector from remaining snapshot (not empty draft).
    expect(fileViewer).toContain('2→1: seed inspector from the remaining target snapshot');
    expect(fileViewer).toContain('manualEditTargetsIdentityFingerprint');
    expect(fileViewer).toContain('listProjectFileRevisionsSoftCached');
    expect(fileViewer).toContain('geometry-only od-edit-targets must not re-parse');
    expect(fileViewer).toContain('export function rememberStablePreviewSource');
    // Group geometry builders forward their shared Document into batch apply.
    expect(fileViewer).toContain('buildGroupMoveStylePatches(');
    expect(fileViewer).toContain('buildGroupResizeStylePatches(');
    expect(fileViewer).toContain('buildGroupGeometryPatches(baseSource, updates)');
    expect(fileViewer).toMatch(
      /applyManualEditBatch\(\s*patches,\s*groupMoveHistoryLabel\(targets\.length\),\s*parsedDoc/,
    );
    expect(fileViewer).toMatch(
      /applyManualEditBatch\(\s*patches,\s*groupResizeHistoryLabel\(targets\.length\),\s*parsedDoc/,
    );
    expect(fileViewer).toContain('applyManualEditBatch(patches, label, parsedDoc)');
  });

  it('shares one Document for style-cancel and multi-select inspector refresh', () => {
    expect(fileViewer).toContain('function cancelManualEditStyleDraft()');
    const cancelStart = fileViewer.indexOf('function cancelManualEditStyleDraft()');
    const cancelBlock = fileViewer.slice(cancelStart, cancelStart + 1_600);
    expect(cancelBlock).toContain('parseManualEditSource(base)');
    expect(cancelBlock).toContain('inspectorManualEditStyles');
    expect(fileViewer).toContain('One Document for snapshot + multi-select inspector merge');
    expect(fileViewer).toContain('One Document for style read + no-op reconcile');
    expect(fileViewer).toContain('reconcileManualEditDraftAfterNoOpFlush(pending, parsedDoc)');
    expect(fileViewer).toContain('readManualEditTargetSnapshot(base, primary.id, {}, parsedDoc)');
    expect(fileViewer).toContain('One Document for multi-target diff + no-op reconcile / apply');
    expect(fileViewer).toContain('applyManualEditBatch(patches, pending.label, parsedDoc)');
    expect(fileViewer).toContain('One Document for style read + no-op reconcile + apply');
    expect(fileViewer).toContain('parsedDoc: sharedParsedDoc');
  });

  it('uses optimistic stackWithPushedRevision after manual/inspect push', () => {
    expect(fileViewer).toContain('stackWithPushedRevision');
    expect(fileViewer).toMatch(
      /stackWithPushedRevision\(\s*revisionStackRef\.current,\s*saved\.revision/,
    );
    // Local tip push skips immediate list GET (optimistic stack already matches).
    expect(fileViewer).toContain('Optimistic tip already matches the push — skip immediate list GET');
    expect(fileViewer).toContain('pinManualEditSavedSource(next)');
    expect(fileViewer).toContain('isManualEditSourcePinActive(manualEditPinnedSourceRef.current)');
    expect(fileViewer).toContain('Warm soft-cache so tip-lag disk soft-retries reuse this list');
    expect(fileViewer).toContain('revisionListSoftCache.set(key, { activeSeq: softSeq, list, at: Date.now() })');
    expect(fileViewer).toContain('Cheap preflight — most decks never host inspect overrides');
    expect(fileViewer).toContain('\\bdata-od-inspect-overrides\\b');
    expect(fileViewer).toContain('Echo selected-target only when membership changes');
    expect(fileViewer).toContain('Single-select: identity field change');
    expect(fileViewer).toContain('Already painting the pinned frame — skip srcdoc tear');
    expect(fileViewer).toContain('warmRevisionListSoftCacheFromStack');
    expect(fileViewer).toContain('url\\s*\\(|expression\\s*\\(|javascript\\s*:|vbscript\\s*:');
    expect(fileViewer).toContain('Geometry-only rebroadcasts for the same id skip React churn');
    expect(fileViewer).toContain('const contentUnchanged = sourceRef.current === nextSource');
    expect(fileViewer).toContain('if (sourceRef.current !== pinnedPreferred)');
    expect(fileViewer).toContain('if (sourceRef.current !== accepted)');
    expect(fileViewer).toContain('Idle remeasure: skip equal geometry churn and reject wild jumps');
    expect(fileViewer).toContain('applyManualEditMeasuredGeometry(measured)');
    expect(fileViewer).toContain('live→raw hold: skip setSource when already painting stable');
    expect(fileViewer).toContain('Undo demotes activeSeq — warm soft-cache for the restored tip');
    expect(fileViewer).toContain('srcdoc path updates via setSource; URL-load still needs reloadKey bust');
    expect(fileViewer).toContain('if (useUrlLoadPreview)');
    const restoreStart = fileViewer.indexOf('function applyRestoredSourceToViewer');
    expect(restoreStart).toBeGreaterThan(0);
    const restoreBlock = fileViewer.slice(restoreStart, restoreStart + 1_800);
    expect(restoreBlock).toContain('const contentUnchanged = sourceRef.current === sourceToApply');
    expect(restoreBlock).toContain('warmRevisionListSoftCacheFromStack');
  });
});

describe('ProjectView agent toast undo', () => {
  it('only offers Undo when parentRevisionId is a string and clears live artifact', () => {
    expect(projectView).toContain('typeof pushedRevision.parentRevisionId === \'string\'');
    const start = projectView.indexOf('typeof pushedRevision.parentRevisionId === \'string\'');
    expect(start).toBeGreaterThan(0);
    const block = projectView.slice(start, start + 1_800);
    expect(block).toContain('setActiveRevisionSequence');
    expect(block).toContain('setArtifact(null)');
    expect(block).not.toContain('persistCommentAttachments.length > 0');
  });
});
