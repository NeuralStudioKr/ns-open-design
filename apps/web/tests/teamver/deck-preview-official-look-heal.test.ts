import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOfficialLookPreviewTemplateIdCache,
  deckHtmlNeedsOfficialLookPreviewHeal,
  deckHtmlNeedsOfficialMotifRemerge,
  healOfficialLookForDeckPreview,
  OFFICIAL_LOOK_STREAMING_HEAL_DEBOUNCE_MS,
  pickOfficialLookHealedPreviewSource,
  shouldApplyOfficialLookPreviewHeal,
} from '../../src/teamver/deckPreviewOfficialLookHeal';

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn(),
}));
vi.mock('../../src/teamver/fetchPluginLocalSkill', () => ({
  mergeOfficialLookCssForTemplate: vi.fn(async (html: string) => (
    /<style\b[^>]*\bdata-od-official-look-css\b/i.test(html)
      ? html
      : `${html}<style data-od-official-look-css>.pill-coral{background:#E85D4E}</style>`
  )),
}));

const COMPACT_CAPSULE_FILL = [
  '<!doctype html><html><body>',
  '<div class="presentation">',
  '<div class="slide slide-1"><h1>Cover</h1></div>',
  '<div class="slide slide-2"><h2>Agenda</h2></div>',
  '</div></body></html>',
].join('');

describe('deckHtmlNeedsOfficialMotifRemerge', () => {
  it('detects pre-v34 percent overscale Daisy stamps', () => {
    const html = '<div class="deco-daisy" style="position:absolute;width:22%;height:22%"></div>';
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(true);
  });

  it('detects pixel overscale Daisy stamps', () => {
    const html = '<div class="deco-daisy" style="width:390px;height:390px"></div>';
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(true);
  });

  it('skips official-band Daisy paint', () => {
    const html = '<div class="deco-daisy" style="position:absolute;width:12%;top:8%"></div>';
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(false);
  });

  it('detects outside-canvas Daisy hangs that letterbox overflow clips', () => {
    const html =
      '<div class="deco-daisy-tl" style="position:absolute;top:-3%;left:-2%;width:12%;height:20%"></div>';
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(true);
  });

  it('detects official Daisy hang CSS still present in look sheets', () => {
    const html = [
      '<style data-od-official-look-css>',
      '.slide-title .deco-daisy-tl{top:-30px;left:-30px;width:220px;height:220px}',
      '</style>',
      '<div class="deco-daisy-tl" style="width:12%"></div>',
    ].join('');
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(true);
  });

  it('skips non-Daisy decks', () => {
    expect(deckHtmlNeedsOfficialMotifRemerge('<section class="slide">Hi</section>')).toBe(false);
  });

  it('detects Graphify / XHS Motif hang CSS that letterbox clips', () => {
    const html = [
      '<style data-od-official-look-css>',
      '.tpl .gd-orb-1{top:-12%;left:-6%;width:520px}',
      '.tpl .xp-blob.b1{top:-8%;right:-6%;width:420px}',
      '</style>',
    ].join('');
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(true);
  });
});

describe('deckHtmlNeedsOfficialLookPreviewHeal', () => {
  it('heals compact fills that never received the persist look sheet', () => {
    expect(deckHtmlNeedsOfficialMotifRemerge(COMPACT_CAPSULE_FILL)).toBe(false);
    expect(deckHtmlNeedsOfficialLookPreviewHeal(COMPACT_CAPSULE_FILL)).toBe(true);
  });

  it('heals labeled Creative Mode hosts that omit class=slide', () => {
    const html = [
      '<!doctype html><html><body><deck-stage>',
      '<section class="s1" data-screen-label="01 Title"><h1>Cover</h1></section>',
      '<section class="s2" data-screen-label="02 Agenda"><h1>Agenda</h1></section>',
      '</deck-stage></body></html>',
    ].join('');
    expect(deckHtmlNeedsOfficialLookPreviewHeal(html)).toBe(true);
    const withoutStage = html.replace(/<\/?deck-stage>/g, '');
    expect(withoutStage).not.toMatch(/class="[^"]*\bslide\b/);
    expect(deckHtmlNeedsOfficialLookPreviewHeal(withoutStage)).toBe(true);
    expect(deckHtmlNeedsOfficialLookPreviewHeal('<section class="hero">Landing</section>')).toBe(false);
  });

  it('skips decks that already have the official look style marker', () => {
    const persisted = `${COMPACT_CAPSULE_FILL}<style data-od-official-look-css>.pill-coral{}</style>`;
    expect(deckHtmlNeedsOfficialLookPreviewHeal(persisted)).toBe(false);
  });

  it('still heals persisted Daisy hang sheets', () => {
    const html = [
      '<style data-od-official-look-css>',
      '.deco-daisy-tl{top:-30px;left:-30px;width:220px;height:220px}',
      '</style>',
      '<div class="deco-daisy-tl" style="width:12%"></div>',
    ].join('');
    expect(deckHtmlNeedsOfficialLookPreviewHeal(html)).toBe(true);
  });
});

describe('shouldApplyOfficialLookPreviewHeal (§1.21 streaming)', () => {
  it('heals stable compact fills while streaming', () => {
    expect(shouldApplyOfficialLookPreviewHeal(COMPACT_CAPSULE_FILL, { streaming: true })).toBe(true);
    expect(shouldApplyOfficialLookPreviewHeal(COMPACT_CAPSULE_FILL, { streaming: false })).toBe(true);
  });

  it('skips unstable / open shells while streaming', () => {
    const openShell = '<!doctype html><html><body><section class="slide"><h1>Cover';
    expect(deckHtmlNeedsOfficialLookPreviewHeal(openShell)).toBe(true);
    expect(shouldApplyOfficialLookPreviewHeal(openShell, { streaming: true })).toBe(false);
    expect(shouldApplyOfficialLookPreviewHeal(openShell, { streaming: false })).toBe(true);
  });

  it('heals once the first titled slide host is closed, even without </html>', () => {
    const firstSlideClosed = [
      '<!doctype html><html><body>',
      '<section class="slide"><h1>Cover</h1><p>Lead copy.</p></section>',
      '<section class="slide"><h2>Agenda',
    ].join('');
    expect(deckHtmlNeedsOfficialLookPreviewHeal(firstSlideClosed)).toBe(true);
    expect(shouldApplyOfficialLookPreviewHeal(firstSlideClosed, { streaming: true })).toBe(true);
  });

  it('skips when look sheet is already present', () => {
    const persisted = `${COMPACT_CAPSULE_FILL}<style data-od-official-look-css>.pill{}</style>`;
    expect(shouldApplyOfficialLookPreviewHeal(persisted, { streaming: true })).toBe(false);
  });
});

describe('pickOfficialLookHealedPreviewSource', () => {
  it('uses healed HTML only for the exact live source that produced it', () => {
    const live = COMPACT_CAPSULE_FILL;
    const healed = `${live}<style data-od-official-look-css></style>`;
    expect(pickOfficialLookHealedPreviewSource({
      livePreviewSource: live,
      healedPreview: healed,
      healedForSource: live,
    })).toBe(healed);
    expect(pickOfficialLookHealedPreviewSource({
      livePreviewSource: `${live}<section class="slide"><h2>New</h2></section>`,
      healedPreview: healed,
      healedForSource: live,
    })).toContain('New');
    expect(pickOfficialLookHealedPreviewSource({
      livePreviewSource: `${live}<section class="slide"><h2>New</h2></section>`,
      healedPreview: healed,
      healedForSource: live,
    })).not.toContain('data-od-official-look-css');
  });
});

describe('healOfficialLookForDeckPreview', () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearOfficialLookPreviewTemplateIdCache();
  });

  it('merges official look onto a compact fill when the project has a template', async () => {
    const { fetchTeamverDaemon } = await import('../../src/teamver/teamverDaemonHeaders');
    const { mergeOfficialLookCssForTemplate } = await import('../../src/teamver/fetchPluginLocalSkill');
    vi.mocked(fetchTeamverDaemon).mockResolvedValue({
      ok: true,
      json: async () => ({ metadata: { selectedDeckTemplateId: 'html-ppt-zhangzara-capsule' } }),
    } as Response);

    const healed = await healOfficialLookForDeckPreview(COMPACT_CAPSULE_FILL, 'proj-1');
    expect(mergeOfficialLookCssForTemplate).toHaveBeenCalledWith(
      COMPACT_CAPSULE_FILL,
      'html-ppt-zhangzara-capsule',
    );
    expect(healed).toContain('data-od-official-look-css');
    expect(healed).toContain('.pill-coral');
  });

  it('reuses cached project templateId across heals', async () => {
    const { fetchTeamverDaemon } = await import('../../src/teamver/teamverDaemonHeaders');
    vi.mocked(fetchTeamverDaemon).mockResolvedValue({
      ok: true,
      json: async () => ({ metadata: { selectedDeckTemplateId: 'html-ppt-zhangzara-studio' } }),
    } as Response);

    await healOfficialLookForDeckPreview(COMPACT_CAPSULE_FILL, 'proj-cache');
    await healOfficialLookForDeckPreview(COMPACT_CAPSULE_FILL, 'proj-cache');
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when the persist look sheet is already present', async () => {
    const { fetchTeamverDaemon } = await import('../../src/teamver/teamverDaemonHeaders');
    const persisted = `${COMPACT_CAPSULE_FILL}<style data-od-official-look-css>.pill-coral{}</style>`;
    const healed = await healOfficialLookForDeckPreview(persisted, 'proj-1');
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
    expect(healed).toBe(persisted);
  });
});

describe('FileViewer preview heal gate', () => {
  it('wires live preview through streaming-aware official-look heal (§1.21)', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../../src/components/FileViewer.tsx'), 'utf8');
    expect(source).toContain('shouldApplyOfficialLookPreviewHeal');
    expect(source).toContain('healOfficialLookForDeckPreview');
    expect(source).toContain('pickOfficialLookHealedPreviewSource');
    expect(source).toContain('OFFICIAL_LOOK_STREAMING_HEAL_DEBOUNCE_MS');
    expect(source).not.toMatch(/if\s*\(\s*streaming\s*\|\|\s*manualEditMode/);
    expect(OFFICIAL_LOOK_STREAMING_HEAL_DEBOUNCE_MS).toBeGreaterThanOrEqual(250);
  });
});
