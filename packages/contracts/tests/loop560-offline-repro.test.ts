import { describe, expect, it } from 'vitest';

import {
  BROADSIDE_KIT_KEY,
  DAISY_DAYS_KIT_KEY,
  PLAYFUL_KIT_KEY,
  fillDaisyDaysKitSlide,
  healBroadsideLeftoverCatalogCopy,
  healPlayfulLeftoverCatalogCopy,
  resolveTemplateCloneKitKey,
  synthesizeTemplateCloneSlideBody,
} from '../src/template-clone-fill.js';
import { runLoop560OfflineRepro } from './helpers/loop560-offline-repro.js';

describe('0918-N06 loop560 Daisy/Broadside/Playful leftover pack', () => {
  it('writes live fixtures and pins leftover-free seed-length decks', () => {
    const rows = runLoop560OfflineRepro();
    expect(rows.length).toBe(6);
    for (const row of rows) {
      expect(row.leftover, row.kit).toEqual([]);
      expect(row.slides, row.kit).toBe(row.previewSlides);
      expect(row.hangulOk, row.kit).toBe(true);
    }
    expect(rows.find((row) => row.kit === 'daisy-pad')?.pad).toBeGreaterThan(0);
  });

  it('resolves kit keys and synth skips 개요 outline', () => {
    expect(resolveTemplateCloneKitKey('<style>--cream:#F5F0E6;Fredoka</style><div class="title-box deco-daisy slide-title">x</div>'))
      .toBe(DAISY_DAYS_KIT_KEY);
    expect(resolveTemplateCloneKitKey('<style>--c-bg-orange:#e85d26</style><section class="slide slide--cover"><div class="cover-body"></div><span class="broadside-num">01</span></section>'))
      .toBe(BROADSIDE_KIT_KEY);
    expect(resolveTemplateCloneKitKey('<style>--bg:#F0C8A0;Syne</style><div class="slide-1 title-main doodle-blob">x</div>'))
      .toBe(PLAYFUL_KIT_KEY);
    const daisy = synthesizeTemplateCloneSlideBody('Teamver 소개', '개요', 2, 'Teamver 소개', DAISY_DAYS_KIT_KEY);
    expect(daisy.lead).not.toMatch(/개요|핵심 포인트/);
    expect(daisy.body).toMatch(/Teamver/);
    const broadside = synthesizeTemplateCloneSlideBody('Teamver 소개', '핵심 포인트', 3, 'Teamver 소개', BROADSIDE_KIT_KEY);
    expect(broadside.lead).not.toMatch(/개요|핵심 포인트|파일럿/);
    expect(broadside.items?.some((item) => item.title === '탐색')).toBeFalsy();
    const playful = synthesizeTemplateCloneSlideBody('Teamver 소개', '개요', 2, 'Teamver 소개', PLAYFUL_KIT_KEY);
    expect(playful.lead).not.toMatch(/개요|핵심 포인트/);
    expect(playful.body).toMatch(/Teamver/);
  });

  it('Daisy fill rewrites leftover 개요 and classroom catalog copy', () => {
    const body = [
      '<div class="title-box"><h1>Daisy Days</h1><p class="subtitle">A cheerful presentation template for bright moments</p></div>',
    ].join('');
    const filled = fillDaisyDaysKitSlide(body, 'class="slide slide-title"', {
      title: '개요',
      lead: 'Teamver가 다루는 문제와 제공 가치',
      bodyText: '',
      kicker: '개요',
      fillLines: [],
    });
    expect(filled).not.toMatch(/개요|Daisy Days|cheerful presentation/);
    expect(filled).toMatch(/Teamver/);
  });

  it('Broadside heal strips $3.5B demo KPI and leftover 개요', () => {
    const html = [
      '<style>--c-bg-orange:#e85d26</style>',
      '<section class="slide slide--cover orange"><div class="cover-body"></div><span class="broadside-num">01</span></section>',
      '<section class="slide slide--stats orange">',
      '<span class="broadside-num">05</span>',
      '<h2>개요</h2>',
      '<div class="stat-card"><div class="stat-value">$3.5B</div><div class="stat-label">Series E</div><div class="stat-note">valuation</div></div>',
      '<div class="slide-chrome"><span class="label muted">Broadside</span></div>',
      '</section>',
    ].join('');
    const out = healBroadsideLeftoverCatalogCopy(html, 'Teamver 소개');
    expect(out).not.toMatch(/개요|\$3\.5B|Series E/);
    expect(out).toMatch(/Teamver|같은 보드|권한/);
  });

  it('Playful heal strips catalog KPI and leftover Overview', () => {
    const html = [
      '<style>--bg:#F0C8A0;font-family:Syne</style>',
      '<div class="slide slide-1"><div class="title-main">Creative Direction & Visual Systems</div><div class="doodle-blob"></div></div>',
      '<div class="slide slide-8">',
      '<div class="section-label">Overview</div>',
      '<div class="stats-title">Impact by the Numbers</div>',
      '<div class="stat-item"><div class="stat-num">98%</div><div class="stat-label">Client retention rate with ongoing partnerships</div></div>',
      '<div class="doodle-blob"></div>',
      '</div>',
    ].join('');
    const out = healPlayfulLeftoverCatalogCopy(html, 'Teamver 소개');
    expect(out).not.toMatch(/Overview|Impact by the Numbers|98%|Client retention/);
    expect(out).toMatch(/Teamver|같은 보드|권한/);
  });
});
