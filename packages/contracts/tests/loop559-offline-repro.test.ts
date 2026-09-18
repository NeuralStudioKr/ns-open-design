import { describe, expect, it } from 'vitest';

import {
  CAPSULE_KIT_KEY,
  EIGHTBIT_ORBIT_KIT_KEY,
  fillEightBitOrbitKitSlide,
  healCapsuleLeftoverCatalogCopy,
  resolveTemplateCloneKitKey,
  synthesizeTemplateCloneSlideBody,
} from '../src/template-clone-fill.js';
import { runLoop559OfflineRepro } from './helpers/loop559-offline-repro.js';

describe('0918-N05 loop559 EightBit/Capsule leftover pack', () => {
  it('writes live fixtures and pins leftover-free seed-length decks', () => {
    const rows = runLoop559OfflineRepro();
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.leftover, row.kit).toEqual([]);
      expect(row.slides, row.kit).toBe(row.previewSlides);
      expect(row.hangulOk, row.kit).toBe(true);
    }
    expect(rows.find((row) => row.kit === 'eightbit-pad')?.pad).toBeGreaterThan(0);
  });

  it('resolves kit keys and synth skips 개요 outline', () => {
    expect(resolveTemplateCloneKitKey('<style>--neon-pink:#F0A6CA;--dark-void:#0A0E27</style><div class="pixel-box scanlines pixel-hero-text">x</div>'))
      .toBe(EIGHTBIT_ORBIT_KIT_KEY);
    expect(resolveTemplateCloneKitKey('<style>--coral:#E85D4E;title-pill;Bodoni</style><div class="title-pill">x</div>'))
      .toBe(CAPSULE_KIT_KEY);
    const eight = synthesizeTemplateCloneSlideBody('Teamver 소개', '개요', 2, 'Teamver 소개', EIGHTBIT_ORBIT_KIT_KEY);
    expect(eight.lead).not.toMatch(/개요|핵심 포인트/);
    expect(eight.body).toMatch(/Teamver/);
    const capsule = synthesizeTemplateCloneSlideBody('Teamver 소개', '핵심 포인트', 3, 'Teamver 소개', CAPSULE_KIT_KEY);
    expect(capsule.lead).not.toMatch(/개요|핵심 포인트|파일럿/);
    expect(capsule.items?.some((item) => item.title === '탐색')).toBeFalsy();
  });

  it('rewrites leftover 개요 pixel-label and keeps Rookie/$0 scrub', () => {
    const body = [
      '<span class="pixel-label">개요</span>',
      '<h2>핵심 포인트</h2>',
      '<div class="tier-card"><div class="tier-name">Rookie</div><div class="tier-price">$0<span>/mo</span></div></div>',
    ].join('');
    const filled = fillEightBitOrbitKitSlide(body, 'class="slide"', {
      title: '개요',
      lead: 'Teamver가 다루는 문제와 제공 가치',
      bodyText: '',
      kicker: '개요',
      fillLines: [],
    });
    expect(filled).not.toMatch(/개요/);
    expect(filled).not.toMatch(/Rookie|\$0/);
    expect(filled).toMatch(/Teamver/);
  });

  it('Capsule heal strips catalog KPI and leftover 개요', () => {
    const html = [
      '<style>--coral:#E85D4E;.title-pill{font-family:Bodoni}</style>',
      '<div class="slide slide-3" data-slide="3">',
      '<div class="header-pill">Core Principles</div>',
      '<h2>개요</h2>',
      '<div class="pillar-card"><h3>Clarity of Purpose</h3><p>Before any action is taken</p></div>',
      '<div class="stat-pill"><div class="stat-number">340%</div><div class="stat-label">Growth</div></div>',
      '</div>',
    ].join('');
    const out = healCapsuleLeftoverCatalogCopy(html, 'Teamver 소개');
    expect(out).not.toMatch(/개요|Clarity of Purpose|340%/);
    expect(out).toMatch(/Teamver|초안|같은 보드/);
  });
});
