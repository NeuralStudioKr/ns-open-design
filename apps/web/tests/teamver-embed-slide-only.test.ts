import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS,
  TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS,
  TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS,
  TEAMVER_EMBED_SLIDE_SCENARIO_PLUGIN_ID,
  defaultSlideOnlyDeckPluginInputs,
  explicitSlideOnlyDeckTemplatePluginInputs,
  homeHeroChipsForGroup,
  inferSlideOnlyDeckVisualTemplateHint,
  visibleNewProjectTabs,
  defaultNewProjectTab,
  resolveSlideOnlyDeckTemplateSkillId,
  resolveSlideOnlyCreatePluginId,
  visibleDesignToolboxActions,
} from '../src/teamver/branding/slideOnlyMvpPolicy';
import { chipsForGroup } from '../src/components/home-hero/chips';
import {
  DESIGN_TOOLBOX_ACTIONS,
  isOpenDesignBrandedToolboxResource,
} from '../src/runtime/design-toolbox';

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
    expect(homeHeroChipsForGroup('migrate', { slideOnlyMvp: true })).toEqual([]);
    expect(TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS.has('image')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS.has('video')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS.has('audio')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS.has('template')).toBe(true);
  });

  it('keeps full chip rail outside slide-only mode', () => {
    expect(homeHeroChipsForGroup('create', { slideOnlyMvp: false }).length).toBe(
      chipsForGroup('create').length,
    );
  });

  it('limits new project tabs to deck only in slide-only mode', () => {
    const tabs = visibleNewProjectTabs(
      ['prototype', 'live-artifact', 'deck', 'template', 'media', 'other'],
      { slideOnlyMvp: true },
    );
    expect(tabs).toEqual(['deck']);
    expect(TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS.has('media')).toBe(true);
    expect(TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS.has('template')).toBe(true);
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

  it('detects Open Design branded toolbox resources for embed filtering', () => {
    expect(isOpenDesignBrandedToolboxResource(['Open Design 랜딩 덱'], 'example-open-design-landing-deck')).toBe(true);
    expect(isOpenDesignBrandedToolboxResource(['github:nexu-io/open-design@main/plugins/_official/examples/deck'])).toBe(false);
    expect(isOpenDesignBrandedToolboxResource(['Open-Slide 1920 캔버스 덱'], 'example-deck-open-slide-canvas')).toBe(false);
    expect(isOpenDesignBrandedToolboxResource(['Html Ppt Hermes Cyber Terminal'])).toBe(false);
  });

  it('forces home free-form submit metadata.kind to deck in slide-only embed (loop 388)', () => {
    const entryShell = readSource('src/components/EntryShell.tsx');

    // Free-form Home submits arrive as projectKind='other'. In slide-only
    // embed, that must still become kind='deck' before the daemon sees it.
    expect(entryShell).toContain("if (slideOnlyMvp) return 'deck'");
    expect(entryShell).toContain("payload.projectKind ?? payload.projectMetadata?.kind ?? 'prototype'");
    expect(entryShell).not.toMatch(/kind:\s*payload\.projectKind\s*\?\?\s*payload\.projectMetadata\?\.kind\s*\?\?\s*['"]prototype['"]/);
    expect(entryShell).toContain('resolveSlideOnlyCreatePluginId');
    expect(entryShell).toContain("conversationMode: 'design'");
  });

  it('coerces free-form create to example-simple-deck in slide-only mode', () => {
    expect(TEAMVER_EMBED_SLIDE_SCENARIO_PLUGIN_ID).toBe('example-simple-deck');
    expect(resolveSlideOnlyCreatePluginId('od-default', { slideOnlyMvp: true })).toBe(
      'example-simple-deck',
    );
    expect(resolveSlideOnlyCreatePluginId('od-new-generation', { slideOnlyMvp: true })).toBe(
      'example-simple-deck',
    );
    expect(resolveSlideOnlyCreatePluginId('example-simple-deck', { slideOnlyMvp: true })).toBe(
      'example-simple-deck',
    );
    expect(resolveSlideOnlyCreatePluginId('community-deck-plugin', { slideOnlyMvp: true })).toBe(
      'community-deck-plugin',
    );
    expect(resolveSlideOnlyCreatePluginId('od-default', { slideOnlyMvp: false })).toBe('od-default');
  });

  it('auto-matches a visual template hint when no deck template was explicitly picked', () => {
    expect(inferSlideOnlyDeckVisualTemplateHint('개발자 포트폴리오 예시로 2장짜리 ppt')).toContain(
      'developer portfolio deck',
    );
    expect(inferSlideOnlyDeckVisualTemplateHint('2026년 상반기 마케팅 전략 보고서')).toContain(
      'marketing strategy deck',
    );

    const inputs = defaultSlideOnlyDeckPluginInputs('AI 도입 효과 발표 자료');
    expect(inputs.visualTemplate).toContain('modern tech deck');
    expect(inputs.visualTemplatePolicy).toContain('do not fall back to a generic default look');
    expect(inputs.designSystem).toContain('auto-match the visual direction');

    const explicit = explicitSlideOnlyDeckTemplatePluginInputs(
      'Html Ppt Zhangzara Daisy Days',
      'example-html-ppt-zhangzara-daisy-days',
    );
    expect(explicit).toMatchObject({
      designSystem: 'Html Ppt Zhangzara Daisy Days',
      visualTemplate: 'Html Ppt Zhangzara Daisy Days',
      selectedDeckTemplateId: 'example-html-ppt-zhangzara-daisy-days',
      selectedDeckTemplateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(explicit.visualTemplatePolicy).toContain('Template visual kit');
    expect(explicit.visualTemplatePolicy).toContain('Motif sprites');
    expect(explicit.visualTemplatePolicy).toContain('do not fall back to a generic default look');
  });

  it('keeps auto visual matching deterministic and subordinate to explicit template picks', () => {
    const mixedBrief = 'AI 스타트업 투자자 피치덱: 제품 로드맵, 성과 지표, 시장 전략';
    expect(inferSlideOnlyDeckVisualTemplateHint(mixedBrief)).toBe(
      inferSlideOnlyDeckVisualTemplateHint(mixedBrief),
    );
    expect(inferSlideOnlyDeckVisualTemplateHint('신입사원 교육과 온보딩 가이드')).toContain(
      'onboarding deck',
    );

    const creativeMode = {
      id: 'html-ppt-zhangzara-creative-mode',
      manifest: { od: { mode: 'deck' } },
    } as Parameters<typeof resolveSlideOnlyDeckTemplateSkillId>[0];
    expect(resolveSlideOnlyDeckTemplateSkillId(creativeMode, { explicitPick: true })).toBe(
      'html-ppt-zhangzara-creative-mode',
    );
  });

  it('keeps deck community cards as visual template skills without requiring explicitPick', () => {
    const creativeMode = {
      id: 'html-ppt-zhangzara-creative-mode',
      manifest: { od: { mode: 'deck' } },
    } as Parameters<typeof resolveSlideOnlyDeckTemplateSkillId>[0];

    expect(resolveSlideOnlyDeckTemplateSkillId(creativeMode, { explicitPick: true })).toBe(
      'html-ppt-zhangzara-creative-mode',
    );
    // Free-form / chip-adjacent binds still persist template metadata when the
    // active plugin is a real deck visual template (not the scenario generator).
    expect(resolveSlideOnlyDeckTemplateSkillId(creativeMode, { explicitPick: false })).toBe(
      'html-ppt-zhangzara-creative-mode',
    );
    expect(resolveSlideOnlyDeckTemplateSkillId(creativeMode)).toBe(
      'html-ppt-zhangzara-creative-mode',
    );
    expect(resolveSlideOnlyDeckTemplateSkillId({
      id: 'od-new-generation',
      manifest: { od: { mode: 'deck' } },
    } as Parameters<typeof resolveSlideOnlyDeckTemplateSkillId>[0], { explicitPick: true })).toBeNull();
    expect(resolveSlideOnlyDeckTemplateSkillId({
      id: 'example-simple-deck',
      manifest: { od: { mode: 'deck' } },
    } as Parameters<typeof resolveSlideOnlyDeckTemplateSkillId>[0])).toBeNull();
  });

  it('stores picked deck templates as metadata while keeping the deck generator plugin', () => {
    const homeView = readSource('src/components/HomeView.tsx');
    const start = homeView.indexOf('const selectedDeckTemplateFromPlugin = slideOnlyMvp');
    expect(start).toBeGreaterThan(0);
    const block = homeView.slice(start, start + 2800);

    expect(block).toContain('resolveSlideOnlyDeckTemplateSkillId');
    expect(block).toContain('selectedDeckTemplateFromSkill');
    expect(block).toContain('isRenderableDesignTemplate(activeSkill)');
    expect(block).toContain('const resolvedSkillId = selectedDeckTemplateSkillId');
    expect(block).toContain('? null');
    expect(block).toContain('selectedDeckTemplateSkillId');
    expect(block).toContain('selectedDeckTemplateTitle');
    expect(block).toContain('selectedDeckTemplateId: selectedDeckTemplateSkillId');
    expect(block).toContain('selectedDeckTemplateTitle: selectedDeckTemplateTitle ?? undefined');
    expect(block).toContain('DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID');
    expect(block).toContain('skillId: resolvedSkillId');
    expect(block).toContain('explicitSlideOnlyDeckTemplatePluginInputs');
    expect(block).toContain('localizePluginTitle(locale, submittedActive.record)');
    expect(block).toContain('localizeSkillName(locale, activeSkill)');
  });

  it('persists canvas launch template picks through metadata instead of project skillId', () => {
    const homeView = readSource('src/components/HomeView.tsx');
    const start = homeView.indexOf('async function confirmCanvasSlideLaunch');
    expect(start).toBeGreaterThan(0);
    const block = homeView.slice(start, start + 4200);

    expect(block).toContain('buildSlideOnlyDeckTemplateCreateBinding');
    expect(block).toContain('templateBinding.pluginId');
    expect(block).toContain('templateBinding.projectMetadata');
    expect(block).toContain('templateBinding.pluginInputsPatch');
    expect(block).not.toContain('pluginId: selectedCanvasSlideTemplate.id');
  });

  it('does not treat bind-only template picks as complete example briefs', () => {
    const homeHero = readSource('src/components/HomeHero.tsx');
    const pickStart = homeHero.indexOf('function pickExamplePluginPreset');
    expect(pickStart).toBeGreaterThan(0);
    const pickBlock = homeHero.slice(pickStart, pickStart + 900);

    expect(pickBlock).toContain('onExamplePromptStatusChange?.(null)');
    expect(pickBlock).not.toContain('briefForPluginPreset');

    const homeView = readSource('src/components/HomeView.tsx');
    const routeStart = homeView.indexOf('async function routePluginUse');
    expect(routeStart).toBeGreaterThan(0);
    const routeBlock = homeView.slice(routeStart, routeStart + 900);

    expect(routeBlock).toContain('examplePromptInfoRef.current = null');
    expect(routeBlock).toContain('Quick');
  });

  it('guards selected deck template visual language above active design-system defaults', () => {
    const projectView = readSource('src/components/ProjectView.tsx');
    expect(projectView).toContain('shouldWrapSelectedTemplate');
    expect(projectView).toContain('primaryDeckSkillId');
    expect(projectView).toContain('wrapSelectedDeckTemplateSkillBody(skillBody!, title)');
    expect(projectView).toContain('Do NOT wrap every deck skill as "user explicitly picked this template"');
    // Guard copy lives in the helper (not inlined in ProjectView).
    const helper = readSource('src/runtime/selected-deck-template.ts');
    expect(helper).toContain('Teamver selected deck template guard');
    expect(helper).toContain('primary visual contract');
    expect(helper).toContain('use it only as secondary brand');
    expect(helper).toContain('secondary brand');
  });

  it('loads selected deck template metadata when project skillId is intentionally empty', () => {
    const projectView = readSource('src/components/ProjectView.tsx');
    expect(projectView).toContain('selectedDeckTemplateMetadata(');
    expect(projectView).toContain('turnDeckTemplateMeta');
    expect(projectView).toContain('enrichChatSendMetaWithProjectDeckTemplate');
    expect(projectView).toContain('fetchPluginLocalSkill(selectedTemplate.id)');
    expect(projectView).toContain('Selected visual template');
    const chatComposer = readSource('src/components/ChatComposer.tsx');
    expect(chatComposer).toContain('selectedDeckTemplateId:');
    expect(chatComposer).toContain('skipDiscoveryBrief: true');
  });

  it('wires slide-only gates into entry and composer surfaces', () => {
    const homeHero = readSource('src/components/HomeHero.tsx');
    const newProject = readSource('src/components/NewProjectPanel.tsx');
    const entryShell = readSource('src/components/EntryShell.tsx');
    const entryNavRail = readSource('src/components/EntryNavRail.tsx');
    const chatComposer = readSource('src/components/ChatComposer.tsx');
    const plusMenu = readSource('src/components/ComposerPlusMenu.tsx');
    const nextStepActions = readSource('src/components/NextStepActions.tsx');
    const designTemplatesSection = readSource('src/components/DesignTemplatesSection.tsx');
    const app = readSource('src/App.tsx');
    const homeView = readSource('src/components/HomeView.tsx');
    const projectView = readSource('src/components/ProjectView.tsx');

    expect(homeHero).toContain('homeHeroChipsForGroup');
    expect(homeHero).toContain('if (shortcuts.length === 0) return null');
    expect(homeHero).toContain('hideComposerIntegrations');
    expect(homeHero).toContain('!slideOnlyMvp');
    expect(newProject).toContain('visibleNewProjectTabs');
    expect(entryShell).toContain('defaultNewProjectTab');
    expect(entryShell).toContain('!slideOnlyMvp');
    expect(entryNavRail).toContain('!slideOnlyMvp');
    expect(entryNavRail).toContain('entry-nav-design-systems');
    // Deploy-safe: hide rail "+" / New project in Teamver embed.
    expect(entryNavRail).toContain('!teamverEmbed');
    expect(entryNavRail).toContain('entry-nav-new-project');
    expect(chatComposer).toContain('showMcp={!hideComposerIntegrations}');
    expect(chatComposer).toContain('visibleDesignToolboxActions');
    expect(chatComposer).toContain('!slideOnlyMvp');
    expect(nextStepActions).toContain('visibleDesignToolboxActions');
    expect(plusMenu).toContain('showConnectors');
    expect(plusMenu).toContain('showMcp');
    expect(plusMenu).toContain('onAttachFromDrive');
    expect(chatComposer).toContain('isTeamverEmbedDriveImportAllowed');
    expect(chatComposer).toContain('teamverDriveImportAllowed');
    expect(chatComposer).toContain('importTeamverDriveAssets');
    expect(app).toContain("fetchDesignTemplates(slideOnlyMvp ? { mode: 'deck', limit: 24 } : undefined)");
    expect(homeView).toContain('listPluginsPage');
    expect(homeView).toContain('getInstalledPlugin');
    expect(projectView).toContain('resolveArtifactPersistFileName');
    expect(projectView).toContain('resolveCommentEditPersistTargetFileName');
    expect(projectView).toContain('artifactVersionTabsToClose');
    expect(projectView).toContain('normalizeSlideOnlyArtifactContractType');
    expect(projectView).toContain('preferDeck: slideOnlyMvp');
    expect(projectView).toContain("project.metadata?.kind === 'deck'");
    // Chip-bound detail is lazy (click/handoff) — no boot prefetch of
    // example-simple-deck (0806-N09).
    expect(homeView).not.toContain('pluginIdsBoundToHomeHeroChips');
    expect(homeView).not.toContain('missingChipBoundPluginIds');
    expect(homeView).toContain('HOME_COMMUNITY_PLUGIN_PAGE_SIZE');
    expect(homeView).toContain('query: communityPluginQuery.trim()');
    expect(homeView).not.toContain('void listPlugins().then((rows) =>');
    expect(designTemplatesSection).toContain('fetchDesignTemplates(');
    expect(designTemplatesSection).toContain("branding.slideOnlyMvp ? { mode: 'deck', limit: 24 } : undefined");
    expect(chatComposer).toContain('embedAttachBlockReason');
    expect(chatComposer).toContain('readTeamverCreateSlidesLaunchFromUrl()');
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
    expect(projectView).toContain("questionFormForSlideOnlyDisplay");
  });

  it("detaches local run streams without daemon cancel on workspace switch (loop 396)", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    expect(projectView).toContain("detachLocalRunStreamConsumers");
    expect(projectView).toMatch(
      /subscribeTeamverWorkspaceChanged[\s\S]*?detachLocalRunStreamConsumers\(\)/,
    );
    const detachStart = projectView.indexOf("const detachLocalRunStreamConsumers");
    expect(detachStart).toBeGreaterThan(0);
    const detachEnd = projectView.indexOf("}, [cancelReattachTextBuffers", detachStart);
    const detachBlock = projectView.slice(detachStart, detachEnd);
    expect(detachBlock).toContain("reattachControllersRef.current.clear()");
    expect(detachBlock).not.toContain("cancelRef.current?.abort()");
  });

  it("detaches local run streams on embed session logout (loop 399)", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    expect(projectView).toContain("subscribeTeamverEmbedSessionChanged");
    expect(projectView).toMatch(
      /subscribeTeamverEmbedSessionChanged[\s\S]*?if \(authenticated\) return;[\s\S]*?detachLocalRunStreamConsumers\(\)/,
    );
  });

  it("routes run failure chat status events through Korean formatter in embed", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    // Durable persist: attachPersistedChatError (status:error + failed) after
    // formatProjectRunErrorForUser — not a bare appendErrorStatusEvent.
    expect(projectView).toContain("attachPersistedChatError(prev, detail, errorCode)");
    expect(projectView).toContain("attachPersistedChatError(prev, msg, errorCode)");
    expect(projectView).toContain("formatProjectRunErrorForUser(err)");
    expect(projectView).toMatch(
      /const detail = formatProjectRunErrorForUser\(err\);[\s\S]{0,500}attachPersistedChatError\(prev, detail, errorCode\)/,
    );
  });

  it("minimizes supporting file streams and collapses design-file scaffolds in slide-only embed", () => {
    const assistant = readSource("src/components/AssistantMessage.tsx");
    const designFiles = readSource("src/components/DesignFilesPanel.tsx");
    const autoOpen = readSource("src/components/auto-open-file.ts");

    expect(assistant).toContain("shouldMinimizeEmbedLiveToolCode");
    expect(assistant).toContain("filterEmbedDeliverableProducedFiles");
    expect(assistant).toContain("hideCodeBody");
    expect(assistant).toContain("hideAssistantThinkingDetails && streaming");
    expect(designFiles).toContain("partitionEmbedDesignFileSections");
    expect(designFiles).toContain("designFiles.sectionSupporting");
    expect(designFiles).toContain("setSupportingExpanded] = useState(true)");
    expect(autoOpen).toContain("shouldDeclineEmbedAutoOpen");
  });
});
