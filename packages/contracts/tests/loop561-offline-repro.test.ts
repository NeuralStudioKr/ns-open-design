import { describe, expect, it } from 'vitest';

import {
  BIENNALE_YELLOW_KIT_KEY,
  CORAL_KIT_KEY,
  MAT_KIT_KEY,
  fillCoralKitSlide,
  healBiennaleYellowLeftoverCatalogCopy,
  healCoralLeftoverCatalogCopy,
  healMatLeftoverCatalogCopy,
  resolveTemplateCloneKitKey,
  synthesizeTemplateCloneSlideBody,
} from '../src/template-clone-fill.js';
import { runLoop561OfflineRepro } from './helpers/loop561-offline-repro.js';

describe('0921-N01 loop561 Coral/Mat/Biennale leftover pack', () => {
  it('writes live fixtures and pins leftover-free seed-length decks', () => {
    const rows = runLoop561OfflineRepro();
    expect(rows.length).toBe(6);
    for (const row of rows) {
      expect(row.leftover, row.kit).toEqual([]);
      expect(row.slides, row.kit).toBe(row.previewSlides);
      expect(row.hangulOk, row.kit).toBe(true);
    }
    expect(rows.find((row) => row.kit === 'mat-pad')?.pad).toBeGreaterThan(0);
  });

  it('resolves kit keys and synth skips 개요 outline', () => {
    expect(resolveTemplateCloneKitKey('<style>--coral:#E85D5D;Bebas Neue</style><div class="slide slide-1"><div class="main-title">x</div><div class="zigzag-layer"></div><div class="brand-mark">VENTURE</div></div>'))
      .toBe(CORAL_KIT_KEY);
    expect(resolveTemplateCloneKitKey('<style>--c-wood:#7a4e24;Bricolage Grotesque;--c-accent:#c07030;--c-bg:#232e26</style><section class="slide slide--cover"><div class="cover-headline">x</div></section>'))
      .toBe(MAT_KIT_KEY);
    expect(resolveTemplateCloneKitKey('<style>--sun:#F1EE2E;--paper:#E9E5DB;.sunglow{}.s-cover{}</style><section class="slide s-cover"></section>'))
      .toBe(BIENNALE_YELLOW_KIT_KEY);
    const coral = synthesizeTemplateCloneSlideBody('Teamver 소개', '개요', 2, 'Teamver 소개', CORAL_KIT_KEY);
    expect(coral.lead).not.toMatch(/개요|핵심 포인트/);
    expect(coral.body).toMatch(/Teamver/);
    const mat = synthesizeTemplateCloneSlideBody('Teamver 소개', '핵심 포인트', 3, 'Teamver 소개', MAT_KIT_KEY);
    expect(mat.lead).not.toMatch(/개요|핵심 포인트|파일럿/);
    expect(mat.items?.some((item) => item.title === '탐색')).toBeFalsy();
    const biennale = synthesizeTemplateCloneSlideBody('Teamver 소개', '개요', 2, 'Teamver 소개', BIENNALE_YELLOW_KIT_KEY);
    expect(biennale.lead).not.toMatch(/개요|핵심 포인트/);
    expect(biennale.body).toMatch(/Teamver/);
  });

  it('Coral empty slide-2 statement is reconstructed so pad does not drop it', () => {
    const filled = fillCoralKitSlide('', 'class="slide slide-2"', {
      title: '개요',
      lead: 'Teamver가 다루는 문제와 제공 가치',
      bodyText: '',
      kicker: '개요',
      fillLines: [],
    });
    expect(filled).toMatch(/big-statement/);
    expect(filled).toMatch(/Teamver/);
    expect(filled).not.toMatch(/개요|VENTURE|QUARTERLY/);
  });

  it('Coral fill rewrites leftover Overview and venture catalog copy', () => {
    const body = [
      '<div class="zigzag-layer"></div>',
      '<div class="brand-mark">VENTURE</div>',
      '<div class="main-title">QUARTERLY<br>STRATEGY<br>SESSION 2026</div>',
    ].join('');
    const filled = fillCoralKitSlide(body, 'class="slide slide-1"', {
      title: '개요',
      lead: 'Teamver가 다루는 문제와 제공 가치',
      bodyText: '',
      kicker: '개요',
      fillLines: [],
    });
    expect(filled).not.toMatch(/개요|VENTURE|QUARTERLY|STRATEGY SESSION/);
    expect(filled).toMatch(/Teamver/);
  });

  it('Mat heal strips [Studio Name] demo KPI and leftover 개요', () => {
    const html = [
      '<style>--c-wood:#7a4e24;Bricolage Grotesque;--c-accent:#c07030;--c-bg:#232e26</style>',
      '<section class="slide slide--cover"><div class="cover-headline"><h1 class="display">Craft<br />Matters</h1></div></section>',
      '<section class="slide slide--stats">',
      '<h2>개요</h2>',
      '<div class="mat-stat"><div class="mat-stat-val">4.7<em>k</em></div><div class="mat-stat-label">Units sold</div></div>',
      '<div class="slide-chrome"><span class="label muted">[Studio Name]</span></div>',
      '</section>',
    ].join('');
    const out = healMatLeftoverCatalogCopy(html, 'Teamver 소개');
    expect(out).not.toMatch(/개요|Craft Matters|4\.7|\[Studio Name\]/);
    expect(out).toMatch(/Teamver|같은 보드|권한/);
  });

  it('Biennale heal strips Aurora catalog KPI and leftover Overview', () => {
    const html = [
      '<style>--sun:#F1EE2E;--paper:#E9E5DB;.sunglow{}.s-cover{}</style>',
      '<section class="slide s-cover"><div class="word">Aurora Programme</div></section>',
      '<section class="slide s-data">',
      '<div class="h">Public attendance</div>',
      '<div class="v">76,400</div>',
      '<div class="lab2">Returning audience</div>',
      '</section>',
    ].join('');
    const out = healBiennaleYellowLeftoverCatalogCopy(html, 'Teamver 소개');
    expect(out).not.toMatch(/Aurora|Public attendance|76,400|Returning audience/);
    expect(out).toMatch(/Teamver|같은 보드|권한/);
  });

  it('Coral heal strips catalog KPI and leftover Overview', () => {
    const html = [
      '<style>--coral:#E85D5D;Bebas Neue</style>',
      '<div class="slide slide-1"><div class="main-title">QUARTERLY STRATEGY</div><div class="zigzag-layer"></div><div class="brand-mark">VENTURE</div></div>',
      '<div class="slide slide-4">',
      '<div class="section-label">01 / Overview</div>',
      '<div class="slide-title">GROWTH METRICS</div>',
      '<div class="sidebar-item"><div class="value">+147%</div><div class="label">Year Over Year</div></div>',
      '</div>',
    ].join('');
    const out = healCoralLeftoverCatalogCopy(html, 'Teamver 소개');
    expect(out).not.toMatch(/Overview|GROWTH METRICS|\+147%|VENTURE/);
    expect(out).toMatch(/Teamver|같은 보드|권한/);
  });
});
