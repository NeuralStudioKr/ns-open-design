import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

/**
 * loop 171 — Static checks that pin the embed share/publish policy:
 *   - workspace content stays inside the Teamver tenant (Drive Publish + local
 *     export only); every external share surface is hidden in embed.
 *
 * The tests scan source instead of mounting, because:
 *   1. FileViewer/PreviewModal/ProjectView are 5–10k line components that are
 *      expensive to render in jsdom and bring deep upstream dependencies.
 *   2. The risk we want to fence is *regression* — a future hand sticking a
 *      raw `canShare ?` on the chrome-share-menu, or wiring
 *      `handleShareToOpenDesign` directly without the embed gate. A textual
 *      pin catches that on the very next CI run.
 */
describe('Teamver embed external share-surface gating (loop 171)', () => {
  it('declares hideExternalShareSurfaces in TeamverBrandingConfig', () => {
    const config = readSource('src/teamver/branding/config.ts');
    expect(config).toContain('hideExternalShareSurfaces: boolean');
    // The flag must be true in embed and false outside, both branches of the
    // env switch — guarded explicitly so a single-branch flip can't sneak in.
    expect(config).toContain('hideExternalShareSurfaces: true');
    expect(config).toContain('hideExternalShareSurfaces: false');
  });

  it('mirrors the flag in the TeamverBrandingProvider default context', () => {
    const provider = readSource('src/teamver/branding/TeamverBrandingProvider.tsx');
    expect(provider).toContain('hideExternalShareSurfaces: false');
  });

  it('gates the FileViewer chrome-share-menu (Vercel/Cloudflare/social/share-link)', () => {
    const fileViewer = readSource('src/components/FileViewer.tsx');
    expect(fileViewer).toContain("from '../teamver/branding/TeamverBrandingProvider'");
    expect(fileViewer).toContain('hideExternalShareSurfaces');
    expect(fileViewer).toContain(
      'const showExternalShareMenu = canShare && !hideExternalShareSurfaces;',
    );
    // Outer wrapper + inner share-menu render both swap from raw canShare
    // to showExternalShareMenu so the share section can never re-appear in
    // embed mode.
    expect(fileViewer).toContain('{showExternalShareMenu || canDownload ? (');
    expect(fileViewer).toContain('{showExternalShareMenu ? (');
    // Drive Publish menu item stays — local-only download menu is unaffected.
    expect(fileViewer).toContain('TeamverPublishDriveMenuItem');
    expect(fileViewer).toContain("from '../teamver/embedUiLabels'");
    expect(fileViewer).toContain("aria-label={embedUiLabel('View mode', '보기 모드')}");
    expect(fileViewer).toContain('aria-label={t(\'fileViewer.download\')}');
    expect(fileViewer).toContain("aria-label={embedUiLabel(`Open comment for ${label}`, `${label} 주석 열기`)}");
    expect(fileViewer).toContain("embedUiLabel('Colors', '색상')");
    expect(fileViewer).toContain("aria-label={embedUiLabel('Download and export options', '다운로드 및 내보내기')}");
  });

  it('gates the PreviewModal share popover social/copy_link section', () => {
    const previewModal = readSource('src/components/PreviewModal.tsx');
    expect(previewModal).toContain("from '../teamver/branding/TeamverBrandingProvider'");
    expect(previewModal).toContain('hideExternalShareSurfaces');
    expect(previewModal).toContain(
      '{previewShareUrl && !hideExternalShareSurfaces ? (',
    );
    // Export section gating must NOT regress: PDF/ZIP/HTML/image stay so users
    // can still download artifacts locally inside embed mode.
    expect(previewModal).toContain("onSharePopoverItemClick?.('pdf')");
    expect(previewModal).toContain("onSharePopoverItemClick?.('zip')");
    expect(previewModal).toContain("onSharePopoverItemClick?.('html')");
  });

  it('disables the assistant Share-to-Open-Design submission in embed', () => {
    const projectView = readSource('src/components/ProjectView.tsx');
    expect(projectView).toContain('hideExternalShareSurfaces');
    expect(projectView).toContain(
      'onShareToOpenDesign={hideExternalShareSurfaces ? undefined : handleShareToOpenDesign}',
    );
    expect(projectView).toContain(
      'shareToOpenDesignBusyMessageId={hideExternalShareSurfaces ? null : shareToOpenDesignBusyMessageId}',
    );
  });
});
