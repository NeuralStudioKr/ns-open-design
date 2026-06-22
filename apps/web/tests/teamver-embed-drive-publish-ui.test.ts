import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

/**
 * loop 173 — Static pin for the Teamver Drive Publish menu UI revamp:
 *
 *   1. The `Open in Teamver Drive` menu item is fully retired (component +
 *      tests gone, no remaining import from FileViewer). The Drive asset link
 *      is still reachable from the success toast (`Teamver 드라이브에서 보기`).
 *   2. All Korean copy in the share-menu Drive row is locked: button label,
 *      destination label, picker action, format chips and progress state.
 *   3. Format selection (`["html", "zip"]`) is operator-controlled — the
 *      previous hardcoded `["html", "zip"]` argument is gone, the default
 *      sent to BE is `["html"]`, and ZIP must remain togglable for the
 *      "publish archive" use case.
 *   4. The native `<select>` is replaced by a headless `TeamverDriveTargetSelect`
 *      listbox so the dropdown matches the embed theme (no OS chrome).
 *
 * We scan source rather than mount because mounting the FileViewer pulls in
 * the full editor stack — the textual pin runs in ~ms on every CI build and
 * is faithful to the regression we want to fence.
 */
describe('Teamver embed Drive publish UI (loop 173)', () => {
  it('removes the standalone "Open in Teamver Drive" menu item', () => {
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

  it('locks the Korean copy on the Drive publish row', () => {
    const menuItem = readSource('src/teamver/components/TeamverPublishDriveMenuItem.tsx');
    expect(menuItem).toContain('저장 위치');
    expect(menuItem).toContain('찾아보기');
    expect(menuItem).toContain('Teamver 드라이브로 발행');
    expect(menuItem).toContain('선택한 팀 드라이브로 발행');
    expect(menuItem).toContain('발행 중…');
    // Soft-pending hint copy stays intact so a partial workspace bridge still
    // tells the user what's happening instead of disabling the publish row.
    expect(menuItem).toContain('Drive 작업공간 연결 중 — 기본 위치로 발행됩니다.');
    expect(menuItem).toContain('Drive 폴더 목록을 불러오지 못했습니다. 찾아보기로 다시 시도하세요.');
  });

  it('keeps HTML/ZIP format selection operator-controlled with HTML default', () => {
    const menuItem = readSource('src/teamver/components/TeamverPublishDriveMenuItem.tsx');
    expect(menuItem).toContain('DEFAULT_PUBLISH_FORMATS');
    expect(menuItem).toContain('"html"');
    expect(menuItem).toContain('"zip"');
    // Format chips are rendered as toggle inputs with the locked `min_length=1`
    // contract enforced via `lockedOn`.
    expect(menuItem).toContain('teamver-drive-format-chip');
    expect(menuItem).toContain('lockedOn');
    // Crucial regression fence: we must not silently re-introduce the old
    // hardcoded `formats: ["html", "zip"]` literal — selectedFormats is
    // routed through state instead.
    expect(menuItem).toContain('formats: selectedFormats');
    expect(menuItem).not.toMatch(/formats:\s*\["html",\s*"zip"\]/);
  });

  it('replaces the native <select> with the headless TeamverDriveTargetSelect', () => {
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

  it('keeps the format type union narrow in publishToDrive', () => {
    const publish = readSource('src/teamver/publishToDrive.ts');
    expect(publish).toContain('TeamverPublishDriveFormat');
    expect(publish).toContain('"html" | "zip"');
  });
});
