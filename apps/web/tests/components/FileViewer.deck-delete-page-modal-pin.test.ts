import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fileViewer = readFileSync(join(here, '../../src/components/FileViewer.tsx'), 'utf8');
const ko = readFileSync(join(here, '../../src/i18n/locales/ko.ts'), 'utf8');

describe('FileViewer deck page delete modal pin (0901-N01-E)', () => {
  it('opens a viewer portal instead of window.confirm', () => {
    expect(fileViewer).not.toContain('window.confirm');
    expect(fileViewer).not.toContain('window.alert');
    expect(fileViewer).not.toContain('슬라이드를 삭제할까요');
    expect(fileViewer).toContain('deckStructureNotice');
    expect(fileViewer).toContain('pendingDeleteSlide');
    expect(fileViewer).toContain('requestDeleteCurrentSlide');
    expect(fileViewer).toContain('confirmPendingDeleteSlide');
    expect(fileViewer).toContain("onClick={() => requestDeleteCurrentSlide()}");
    expect(fileViewer).toContain('페이지를 삭제할까요?');
    expect(fileViewer).toContain('버전 기록에서 되돌릴 수 있습니다.');
    expect(fileViewer).toContain("role=\"dialog\"");
    expect(fileViewer).toContain('aria-labelledby={deletePageTitleId}');
    expect(fileViewer).toContain('void confirmPendingDeleteSlide()');
  });

  it('cancels the pending delete from Escape and the backdrop', () => {
    const start = fileViewer.indexOf('if (!pendingDeleteSlide && !deckStructureNotice) return;');
    expect(start).toBeGreaterThan(0);
    const escapeBlock = fileViewer.slice(start, start + 400);
    expect(escapeBlock).toContain("e.key !== 'Escape'");
    expect(escapeBlock).toContain('setPendingDeleteSlide(null)');
    expect(fileViewer).toContain('className="modal-backdrop viewer-modal-backdrop"');
    expect(fileViewer).toContain('onClick={() => setPendingDeleteSlide(null)}');
  });

  it('keeps one-page chrome copy as 페이지 and hides insert-blank', () => {
    expect(ko).toContain("'fileViewer.deleteSlide': '페이지 삭제'");
    expect(ko).toContain("'fileViewer.previousSlide': '이전 페이지'");
    expect(ko).toContain("'fileViewer.deckFilmstripAria': '페이지 목록'");
    expect(fileViewer).toContain('handleInsertBlankSlideAfterCurrent');
    expect(fileViewer).not.toContain('void handleInsertBlankSlideAfterCurrent()');
    expect(fileViewer).not.toContain("t('fileViewer.insertBlankSlide')");
  });
});
