import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deckHtmlNeedsOfficialLookPreviewHeal,
  deckHtmlNeedsOfficialMotifRemerge,
  healOfficialLookForDeckPreview,
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

describe('healOfficialLookForDeckPreview', () => {
  afterEach(() => {
    vi.clearAllMocks();
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

  it('does not fetch when the persist look sheet is already present', async () => {
    const { fetchTeamverDaemon } = await import('../../src/teamver/teamverDaemonHeaders');
    const persisted = `${COMPACT_CAPSULE_FILL}<style data-od-official-look-css>.pill-coral{}</style>`;
    const healed = await healOfficialLookForDeckPreview(persisted, 'proj-1');
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
    expect(healed).toBe(persisted);
  });
});

describe('FileViewer preview heal gate', () => {
  it('wires live preview through official-look heal, not Motif-only remmerge', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../../src/components/FileViewer.tsx'), 'utf8');
    expect(source).toContain('deckHtmlNeedsOfficialLookPreviewHeal');
    expect(source).toContain('healOfficialLookForDeckPreview');
    expect(source).not.toMatch(/deckHtmlNeedsOfficialMotifRemerge\(livePreviewSource\)/);
  });
});
