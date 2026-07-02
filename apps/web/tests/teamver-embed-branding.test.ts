import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveTeamverBranding } from '../src/teamver/branding/config';
import * as designApiBase from '../src/teamver/designApiBase';

const webRoot = resolve(import.meta.dirname, '..');

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

describe('Teamver embed branding policy', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
  });

  it('exposes full nav and external links outside embed', () => {
    const branding = resolveTeamverBranding();
    expect(branding.enabled).toBe(false);
    expect(branding.hideExternalLinks).toBe(false);
    expect(branding.hideHandoffButton).toBe(false);
    expect(branding.lockExecutionConfig).toBe(false);
    expect(branding.hideLocalWorkspaceControls).toBe(false);
    expect(branding.hideWorkspaceTabsBar).toBe(false);
    expect(branding.hideExternalShareSurfaces).toBe(false);
    expect(branding.hideAssistantThinkingDetails).toBe(false);
    expect(branding.hideNavViews.size).toBe(0);
  });

  it('locks down embed UI surfaces when embed mode is on', () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const branding = resolveTeamverBranding();

    expect(branding.enabled).toBe(true);
    expect(branding.title).toBe('Teamver Design');
    expect(branding.heroSubtitle).toContain('slide');
    expect(branding.faviconUrl).toBe('/teamver/Logo-icon.svg');
    expect(branding.hideExternalLinks).toBe(true);
    expect(branding.hideTopbarExecutionSwitcher).toBe(true);
    expect(branding.hideSettingsDialogLink).toBe(true);
    expect(branding.hideStudioExecutionControls).toBe(true);
    expect(branding.hideUsefulTips).toBe(true);
    expect(branding.hideHandoffButton).toBe(true);
    expect(branding.hideAssistantModelLabels).toBe(true);
    expect(branding.hideAssistantThinkingDetails).toBe(true);
    expect(branding.lockExecutionConfig).toBe(true);
    expect(branding.hideLocalWorkspaceControls).toBe(true);
    expect(branding.hideWorkspaceTabsBar).toBe(true);
    expect(branding.hideNavViews.has('tasks')).toBe(true);
    expect(branding.hideNavViews.has('plugins')).toBe(true);
    expect(branding.hideNavViews.has('integrations')).toBe(true);
    expect(branding.slideOnlyMvp).toBe(true);
    expect(branding.hideComposerIntegrations).toBe(true);
    expect(branding.hideCommunityGallery).toBe(true);
    expect(branding.hidePluginRegistry).toBe(true);
    expect(branding.hideExternalShareSurfaces).toBe(true);
    expect(branding.allowedSettingsSections).toEqual(
      new Set(['language', 'appearance', 'designTemplates', 'about']),
    );
  });

  it('keeps the tenant-boundary share gates aligned in embed', () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const branding = resolveTeamverBranding();

    // External share + community gallery + plugin registry must move
    // together: any of these slipping back to `false` re-exposes a tenant
    // exit path the embed contract forbids.
    expect(branding.hideExternalShareSurfaces).toBe(true);
    expect(branding.hideExternalLinks).toBe(true);
    expect(branding.hideCommunityGallery).toBe(true);
    expect(branding.hidePluginRegistry).toBe(true);
    expect(branding.hideHandoffButton).toBe(true);
  });

  it('keeps embed share gates off outside embed mode', () => {
    const branding = resolveTeamverBranding();

    expect(branding.hideExternalShareSurfaces).toBe(false);
    expect(branding.hideExternalLinks).toBe(false);
    expect(branding.hideCommunityGallery).toBe(false);
    expect(branding.hidePluginRegistry).toBe(false);
    expect(branding.hideHandoffButton).toBe(false);
    expect(branding.hideUsefulTips).toBe(false);
  });

  it('hides OD-specific project edit tips in embed surfaces', () => {
    const chatPane = readFileSync(resolve(webRoot, 'src/components/ChatPane.tsx'), 'utf8');
    const designFiles = readFileSync(resolve(webRoot, 'src/components/DesignFilesPanel.tsx'), 'utf8');
    const fileViewer = readFileSync(resolve(webRoot, 'src/components/FileViewer.tsx'), 'utf8');

    expect(chatPane).toContain('hideUsefulTips');
    expect(chatPane).toContain('hideUsefulTips ? null : (');
    expect(chatPane).toContain('chat-examples');
    expect(designFiles).toContain('!hideUsefulTips ? (');
    expect(designFiles).toContain('df-footer-info');
    expect(fileViewer).toContain('hideUsefulTips');
    expect(fileViewer).toContain('&& !hideUsefulTips ? (');
    expect(fileViewer).toContain('inspect-empty-hint-container');
  });

  it('routes project edit surfaces through useTeamverT', () => {
    const chatComposer = readFileSync(resolve(webRoot, 'src/components/ChatComposer.tsx'), 'utf8');
    const chatPane = readFileSync(resolve(webRoot, 'src/components/ChatPane.tsx'), 'utf8');
    const designFiles = readFileSync(resolve(webRoot, 'src/components/DesignFilesPanel.tsx'), 'utf8');
    const fileWorkspace = readFileSync(resolve(webRoot, 'src/components/FileWorkspace.tsx'), 'utf8');
    const fileViewer = readFileSync(resolve(webRoot, 'src/components/FileViewer.tsx'), 'utf8');
    const projectView = readFileSync(resolve(webRoot, 'src/components/ProjectView.tsx'), 'utf8');
    const previewModal = readFileSync(resolve(webRoot, 'src/components/PreviewModal.tsx'), 'utf8');
    expect(chatComposer).toContain('useTeamverT');
    expect(chatPane).toContain('useTeamverT');
    expect(designFiles).toContain('useTeamverT');
    expect(fileWorkspace).toContain('useTeamverT');
    expect(fileViewer).toContain('useTeamverT');
    expect(fileViewer).not.toMatch(/\buseT\(\)/);
    expect(projectView).toContain('useTeamverT');
    expect(previewModal).toContain('useTeamverT');
  });

  it('routes Teamver shell components through useTeamverT', () => {
    const publishChip = readFileSync(
      resolve(webRoot, 'src/teamver/components/TeamverLatestPublishChip.tsx'),
      'utf8',
    );
    const importModal = readFileSync(
      resolve(webRoot, 'src/teamver/components/TeamverDriveImportModal.tsx'),
      'utf8',
    );
    const runsBanner = readFileSync(
      resolve(webRoot, 'src/teamver/components/TeamverBackgroundRunsBanner.tsx'),
      'utf8',
    );
    const canvasLaunch = readFileSync(
      resolve(webRoot, 'src/teamver/components/TeamverCanvasSlideLaunchModal.tsx'),
      'utf8',
    );
    const topbarChips = readFileSync(
      resolve(webRoot, 'src/teamver/components/EntryTopbarChips.tsx'),
      'utf8',
    );
    const sessionBanner = readFileSync(
      resolve(webRoot, 'src/components/TeamverSessionBanner.tsx'),
      'utf8',
    );
    const escapeBar = readFileSync(
      resolve(webRoot, 'src/components/TeamverWorkspaceEscapeBar.tsx'),
      'utf8',
    );
    const brandLabel = readFileSync(
      resolve(webRoot, 'src/teamver/branding/useBrandLabel.ts'),
      'utf8',
    );

    for (const source of [
      publishChip,
      importModal,
      runsBanner,
      canvasLaunch,
      topbarChips,
      sessionBanner,
      escapeBar,
      brandLabel,
    ]) {
      expect(source).toContain('useTeamverT');
      expect(source).not.toMatch(/\buseT\(\)/);
    }
  });
});
