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
    // liveHtml mount shares one repair across source/stable/paints init.
    expect(fileViewer).toContain('initialLiveHtmlRepaired');
    expect(fileViewer).toContain('One repair for liveHtml init');
    // remove-element remaining multi-select shares one Document.
    expect(fileViewer).toContain('One Document for remaining multi-select inspector after remove');
    expect(fileViewer).toContain('remainingDoc');
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
