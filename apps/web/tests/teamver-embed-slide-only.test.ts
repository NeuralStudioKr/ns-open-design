import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS,
  TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS,
  TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS,
  homeHeroChipsForGroup,
  visibleNewProjectTabs,
  defaultNewProjectTab,
  visibleDesignToolboxActions,
} from '../src/teamver/branding/slideOnlyMvpPolicy';
import { chipsForGroup } from '../src/components/home-hero/chips';
import { DESIGN_TOOLBOX_ACTIONS } from '../src/runtime/design-toolbox';

const webRoot = resolve(import.meta.dirname, '..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('Teamver embed slide-only MVP policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides media and non-deck home hero chips in slide-only mode', () => {
    const createIds = homeHeroChipsForGroup('create', { slideOnlyMvp: true }).map((c) => c.id);
    expect(createIds).toEqual(['deck']);
    expect(TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS.has('image')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS.has('video')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS.has('audio')).toBe(true);
  });

  it('keeps full chip rail outside slide-only mode', () => {
    expect(homeHeroChipsForGroup('create', { slideOnlyMvp: false }).length).toBe(
      chipsForGroup('create').length,
    );
  });

  it('limits new project tabs to deck and template in slide-only mode', () => {
    const tabs = visibleNewProjectTabs(
      ['prototype', 'live-artifact', 'deck', 'template', 'media', 'other'],
      { slideOnlyMvp: true },
    );
    expect(tabs).toEqual(['deck', 'template']);
    expect(TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS.has('media')).toBe(true);
  });

  it('defaults new project tab to deck in slide-only mode', () => {
    expect(defaultNewProjectTab({ slideOnlyMvp: true })).toBe('deck');
    expect(defaultNewProjectTab({ slideOnlyMvp: false })).toBe('prototype');
  });

  it('hides media and motion toolbox actions in slide-only mode', () => {
    const actionIds = visibleDesignToolboxActions(DESIGN_TOOLBOX_ACTIONS, {
      slideOnlyMvp: true,
    }).map((action) => action.id);

    expect(actionIds).toEqual(['auto-match', 'anti-ai-polish', 'visual-polish']);
    expect(TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS.has('image-gen')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS.has('video-gen')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS.has('motion')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS.has('motion-polish')).toBe(true);
  });

  it('wires slide-only gates into entry and composer surfaces', () => {
    const homeHero = readSource('src/components/HomeHero.tsx');
    const newProject = readSource('src/components/NewProjectPanel.tsx');
    const entryShell = readSource('src/components/EntryShell.tsx');
    const entryNavRail = readSource('src/components/EntryNavRail.tsx');
    const chatComposer = readSource('src/components/ChatComposer.tsx');
    const plusMenu = readSource('src/components/ComposerPlusMenu.tsx');
    const nextStepActions = readSource('src/components/NextStepActions.tsx');

    expect(homeHero).toContain('homeHeroChipsForGroup');
    expect(homeHero).toContain('hideComposerIntegrations');
    expect(newProject).toContain('visibleNewProjectTabs');
    expect(entryShell).toContain('defaultNewProjectTab');
    expect(entryShell).toContain('!slideOnlyMvp');
    expect(entryNavRail).toContain('!slideOnlyMvp');
    expect(entryNavRail).toContain('entry-nav-design-systems');
    expect(chatComposer).toContain('showMcp={!hideComposerIntegrations}');
    expect(chatComposer).toContain('visibleDesignToolboxActions');
    expect(nextStepActions).toContain('visibleDesignToolboxActions');
    expect(plusMenu).toContain('showConnectors');
    expect(plusMenu).toContain('showMcp');
    expect(plusMenu).toContain('onAttachFromDrive');
    expect(chatComposer).toContain('isTeamverEmbedDriveImportAllowed');
    expect(chatComposer).toContain('teamverDriveImportAllowed');
    expect(chatComposer).toContain('importTeamverDriveAssets');
    expect(chatComposer).toContain('embedAttachBlockReason');
    expect(chatComposer).toContain("intent === 'create-slides'");
    expect(chatComposer).toContain('TeamverCanvasSlideLaunchModal');
    expect(chatComposer).toContain('setCanvasSlideLaunch(null)');
    expect(chatComposer).toContain('setDriveImportPartial(null)');
    expect(chatComposer).toContain('subscribeTeamverWorkspaceChanged');
    expect(chatComposer).toContain("embed ? '브라우저'");
  });

  it("clears ProjectView error banners on workspace switch", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    expect(projectView).toContain("subscribeTeamverWorkspaceChanged");
    expect(projectView).toContain("setConversationLoadError(null)");
    expect(projectView).toContain("formatProjectConversationErrorForUser");
  });

  it("routes run failure chat status events through Korean formatter in embed", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    expect(projectView).toContain("appendAssistantErrorEvent(message.id, formatProjectRunErrorForUser(err)");
    expect(projectView).toContain("appendErrorStatusEvent(prev, formatProjectRunErrorForUser(err), errorCode)");
  });
});
