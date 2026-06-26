import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

/**
 * loop 173 + 174 — Static pin for the Teamver Drive Publish menu UI:
 *
 *   1. `Open in Teamver Drive` menu item stays retired (loop 173 — component
 *      + tests gone, no remaining import from FileViewer). Drive deep link
 *      is reachable via the publish success toast and the new history list.
 *   2. Korean copy in the share-menu Drive row is locked: button label,
 *      destination label, picker action, progress state.
 *   3. Drive publish is HTML-only (loop 174). The publish helper sends a
 *      static `["html"]` array — ZIP/PDF are intentionally absent from the
 *      surface.
 *   4. The native `<select>` is replaced by a headless `TeamverDriveTargetSelect`
 *      listbox so the dropdown matches the embed theme (no OS chrome).
 *   5. `TeamverDrivePublishHistory` is mounted at the top of the publish
 *      menu and refetches after every publish — operators can see which
 *      version is currently in Drive without leaving the embed.
 *   6. The publish helper remembers the last destination keyed by
 *      `workspace.project` in localStorage so the next publish defaults to
 *      it.
 *
 * We scan source rather than mount because mounting the FileViewer pulls in
 * the full editor stack — the textual pin runs in ~ms on every CI build and
 * is faithful to the regression we want to fence.
 */
describe('Teamver embed Drive publish UI (loop 173 + 174)', () => {
  it('removes the standalone "Open in Teamver Drive" menu item (loop 173)', () => {
    expect(
      existsSync(resolve(webRoot, 'src/teamver/components/TeamverOpenDrivePublishMenuItem.tsx')),
    ).toBe(false);
    expect(
      existsSync(resolve(webRoot, 'tests/teamver-open-drive-publish-menu-item.test.tsx')),
    ).toBe(false);

    const fileViewer = readSource('src/components/FileViewer.tsx');
    expect(fileViewer).not.toContain('TeamverOpenDrivePublishMenuItem');
    // Korean success toast still surfaces a Drive jump-link so the standalone
    // menu item is not needed.
    expect(fileViewer).toContain('Teamver 드라이브에서 보기');
  });

  it('locks the Korean copy on the Drive publish row (loop 173)', () => {
    const menuItem = readSource('src/teamver/components/TeamverPublishDriveMenuItem.tsx');
    expect(menuItem).toContain('저장 위치');
    expect(menuItem).toContain('찾아보기');
    expect(menuItem).toContain('Teamver 드라이브로 HTML 발행');
    expect(menuItem).toContain('선택한 팀 드라이브로 HTML 발행');
    expect(menuItem).toContain('발행 중…');
    // Error hints route through formatPublishErrorCodeForUser (loop 334+).
    expect(menuItem).toContain('formatPublishErrorCodeForUser');
    const publishErrors = readSource('src/teamver/publishToDrive.ts');
    expect(publishErrors).toContain('Teamver 작업공간 연결 중입니다 — 기본 위치로 발행됩니다.');
    expect(publishErrors).toContain(
      'Drive 폴더 목록을 불러오지 못했습니다 — 찾아보기 또는 다시 시도하세요.',
    );
  });

  it('pins HTML-only Drive publish (loop 174)', () => {
    const menuItem = readSource('src/teamver/components/TeamverPublishDriveMenuItem.tsx');
    expect(menuItem).toContain('PUBLISH_FORMATS');
    expect(menuItem).toMatch(/PUBLISH_FORMATS[^=]*=\s*\["html"\]/);
    // Regression fence: the previous loop-173 contract sent `["html", "zip"]`
    // when both chips were ticked. Both surface artefacts (selectedFormats
    // state + the multi-format literal) must stay gone.
    expect(menuItem).not.toContain('selectedFormats');
    expect(menuItem).not.toMatch(/formats:\s*\["html",\s*"zip"\]/);
    expect(menuItem).not.toMatch(/toggleFormat/);
    // The single-line hint takes the chip block's place — without it
    // operators don't know PDF/ZIP exist as a local download path.
    expect(menuItem).toContain('PDF/ZIP 추출은 다운로드 메뉴에서 로컬 저장하세요');
  });

  it('replaces the native <select> with the headless TeamverDriveTargetSelect (loop 173)', () => {
    const menuItem = readSource('src/teamver/components/TeamverPublishDriveMenuItem.tsx');
    expect(menuItem).toContain('TeamverDriveTargetSelect');
    expect(menuItem).not.toMatch(/<select\b/);

    const select = readSource('src/teamver/components/TeamverDriveTargetSelect.tsx');
    // Stable test hooks + ARIA wiring required for keyboard/SR users.
    expect(select).toContain('data-testid="teamver-drive-target-select"');
    expect(select).toContain('data-testid="teamver-drive-target-popover"');
    expect(select).toContain('aria-haspopup="listbox"');
    expect(select).toContain('role="listbox"');
    expect(select).toContain('role="option"');
  });

  it('mounts TeamverDrivePublishHistory and refreshes after every publish (loop 174)', () => {
    const menuItem = readSource('src/teamver/components/TeamverPublishDriveMenuItem.tsx');
    expect(menuItem).toContain('TeamverDrivePublishHistory');
    expect(menuItem).toContain('historyRefreshKey');
    expect(menuItem).toContain('setHistoryRefreshKey');

    const history = readSource('src/teamver/components/TeamverDrivePublishHistory.tsx');
    expect(history).toContain('listTeamverProjectOutputs');
    expect(history).toContain('data-testid="teamver-drive-history"');
    // Korean copy keys we care about
    expect(history).toContain('Drive 발행 이력');
    expect(history).toContain('아직 Teamver 드라이브에 발행한 적이 없습니다');
    // Version label format is `v{N}` driven off the DESC-sorted ready list.
    expect(history).toContain('ready.length - index');
    expect(history).toContain('VISIBLE_ROW_LIMIT');
  });

  it('persists the last publish destination per workspace+project (loop 174)', () => {
    const lastTarget = readSource('src/teamver/drivePublishLastTarget.ts');
    const menuItem = readSource('src/teamver/components/TeamverPublishDriveMenuItem.tsx');
    expect(lastTarget).toContain('lastPublishTargetStorageKey');
    expect(lastTarget).toContain('teamver.drive.lastPublishTarget.');
    expect(lastTarget).toContain('readLastPublishTargetId');
    expect(lastTarget).toContain('writeLastPublishTargetId');
    expect(menuItem).toContain('readLastPublishTargetId');
    expect(menuItem).toContain('resolvePublishTargetById');
    expect(menuItem).toContain('readRecentPublishTargets');
    expect(menuItem).toContain('data-testid="teamver-drive-post-run-hint"');
    expect(menuItem).toContain('setPickerOpen(false)');
  });

  it('loads Drive home recent folder grid in the publish picker (loop 359 · S-2)', () => {
    const picker = readSource('src/teamver/components/TeamverDrivePickerModal.tsx');
    expect(picker).toContain('browseTeamverDriveImportPage');
    expect(picker).toContain('enterFolder');
    expect(picker).toContain('data-testid="teamver-drive-picker-load-more"');
    expect(picker).toContain('listTeamverDrivePublishHomeRecentTargets');
    expect(picker).toContain('data-testid="teamver-drive-picker-home-recent"');
    expect(picker).toContain('Drive 홈 최근');

    const homeRecent = readSource('src/teamver/drivePublishHomeRecent.ts');
    expect(homeRecent).toContain('/api/v2/drive/home/recent');
    expect(homeRecent).toContain('assets,shared_with_me');
  });

  it('shows recent asset grid + browse thumbnails in publish picker (loop 420 · Phase 1-2c)', () => {
    const picker = readSource('src/teamver/components/TeamverDrivePickerModal.tsx');
    expect(picker).toContain('listTeamverDrivePublishRecentAssets');
    expect(picker).toContain('fetchTeamverDriveImportThumbnails');
    expect(picker).toContain('data-testid="teamver-drive-picker-recent-assets"');
    expect(picker).toContain('data-testid={`teamver-drive-picker-asset-${row.assetId}`}');
    expect(picker).toContain('teamver-drive-import-grid');

    const recentAssets = readSource('src/teamver/drivePublishRecentAssets.ts');
    expect(recentAssets).toContain('folderId');
    expect(recentAssets).toContain('/api/v2/drive/home/recent');
  });

  it('keeps the format type union narrow in publishToDrive (loop 173)', () => {
    const publish = readSource('src/teamver/publishToDrive.ts');
    expect(publish).toContain('TeamverPublishDriveFormat');
    expect(publish).toContain('"html" | "zip"');
  });
});
