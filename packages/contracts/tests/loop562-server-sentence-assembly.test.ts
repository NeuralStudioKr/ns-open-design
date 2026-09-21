/**
 * 루프562 · 서버 문장 짜맞추기 제거 회귀 pin.
 *
 * User report (2026-09-21):
 *   "결과물 퀄리티가 좋지 않다. 11초만에 완료되었는데 내용 생성이 AI 를
 *    안 거치게 바뀐 것 같다. 템플릿 관련은 채우는 형식이되, 내용은 AI 로
 *    만들어야 한다."
 *
 * 증거 HTML(Neuralstudio 소개, Block Frame) 조각:
 *   - `Neuralstudio 소개 2`  ← `${deckTitle} · N` salt suffix
 *   - `대상 고객별 메시지 다음`, `측정해야 할 지표 쓰는 길` ← `${x} 다음/쓰는 길`
 *   - `사용자가과 전환 비용을 먼저 정의` ← healer 가 문장 중간을 substring-strip
 *     하고 남긴 잔재.
 *
 * 이 슬라이스에서는 (a) `${deckTitle} · N` salt suffix 를 발행하는 5개 경로
 * (empty-brief starter · pad · enrich fallback · pad content · instruction
 * parroting rewrite) 와 (b) `padDeterministicTemplateCloneSlides` dedupe
 * fallback 을 제거했다. 나머지 (`${topic} 쓰는 길` / substring truncation)
 * 는 별도 슬라이스 대상이며, fixture 로 회귀 재현만 pin 한다.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import {
  buildTemplateClonedDeckHtml,
  fillAndTrimCardPeers,
  fillCoralKitSlide,
  healBlockFrameLeftoverCatalogCopy,
  resolveTemplateCloneSlidesForDeterministicFill,
} from '../src/template-clone-fill';

const BARE_DOMAIN_BRIEF = 'neuralstudio.kr 회사 사이트야. 분석해서 회사 소개 ppt 만들어줘.';

/**
 * fixture ledger — 사용자 report HTML 은 스크린샷 공유였기에 이 minimal repro
 * 로 저장. 새로운 회귀는 이 fixture 를 read + assert 하도록 확장한다.
 */
const BROKEN_FIXTURE_URL = new URL(
  './fixtures/loop562-block-frame-broken.html',
  import.meta.url,
);

describe('루프562 · server sentence assembly 제거', () => {
  it('empty-brief starter 는 `${deckTitle} · N` salt 접미를 발행하지 않는다', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-block-frame/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const deckTitle = 'Neuralstudio 소개';
    // brief 없음(=empty-brief starter path) — outline 도 없이 seed 만 채운다.
    const cloned = buildTemplateClonedDeckHtml(html, [], {
      title: deckTitle,
      templateId: 'html-ppt-zhangzara-block-frame',
      maxSlides: 5,
    });
    expect(cloned).toBeTruthy();
    const visibleTitles = String(cloned || '').match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi) || [];
    for (const raw of visibleTitles) {
      const inner = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      // 새 title salt 회귀 감시. `Neuralstudio 소개 2`, `Neuralstudio 소개 · 2`,
      // `Neuralstudio · 3` 등 모든 형태를 잡는다.
      expect(inner).not.toMatch(/Neuralstudio\s+소개(?:\s*[·|-])?\s*\d+/);
      expect(inner).not.toMatch(/Neuralstudio\s*·\s*\d+/);
    }
    // 문서 전체에도 `Neuralstudio 소개 2`, `Neuralstudio · 2` 등 salt 조합이
    // 남아있지 않아야 한다.
    expect(cloned).not.toMatch(/Neuralstudio\s+소개\s*·?\s*\d+/);
  });

  it('resolveTemplateCloneSlidesForDeterministicFill 결과 title 은 `${cover} · N` salt 없음', () => {
    const slides = resolveTemplateCloneSlidesForDeterministicFill({
      userInstruction: BARE_DOMAIN_BRIEF,
      deckTitle: 'Neuralstudio',
      slideCount: 12,
    });
    expect(slides.length).toBeGreaterThan(0);
    for (const slide of slides) {
      const title = String(slide.title ?? '');
      // 회귀 pin: `Neuralstudio · 2`, `Neuralstudio 2`(공백 뒤 숫자 접미) 금지.
      // 자연스러운 문장 안의 숫자(`3개`, `Top 5`) 는 padDeterministic 이
      // 만들지 않으므로 여기서 pin 해도 안전.
      expect(title).not.toMatch(/^\s*Neuralstudio\s+\d+\s*$/);
      expect(title).not.toMatch(/^\s*Neuralstudio\s*·\s*\d+\s*$/);
    }
  });

  it('bare-domain brief 로 만든 outline title 은 `${cover} · N` salt 를 emit 하지 않는다', () => {
    // pad + dedupe fallback 조합에서 salt suffix 가 재발생하는지 pin.
    const slides = resolveTemplateCloneSlidesForDeterministicFill({
      userInstruction: BARE_DOMAIN_BRIEF,
      deckTitle: 'Neuralstudio',
      slideCount: 20,
    });
    const titles = slides.map((s) => String(s.title ?? '').trim());
    // 실제로 padDeterministicTemplateCloneSlides dedupe 가 emit 하던
    // `Neuralstudio · N` / `Neuralstudio 소개 · N` 패턴이 이제 없어야 한다.
    for (const title of titles) {
      expect(title).not.toMatch(/·\s*\d+\s*$/);
      expect(title).not.toMatch(/^\s*Neuralstudio\s+\d+\s*$/);
    }
    expect(titles[0]).toBeTruthy();
  });

  it('사용자 report HTML(minimal repro) 은 회귀 재현 패턴을 그대로 포함한다', async () => {
    // 이 fixture 는 회귀 재현 archive. heal 후 잘린 문장/salt 를 pin 하는 것은
    // 별도 슬라이스에서 다룬다 — 지금은 archive + 스크립트 재현 통로만 확보.
    const html = await readFile(BROKEN_FIXTURE_URL, 'utf8');
    expect(html).toMatch(/Neuralstudio 소개 2/);
    expect(html).toMatch(/대상 고객별 메시지 다음/);
    expect(html).toMatch(/측정해야 할 지표 쓰는 길/);
    expect(html).toMatch(/사용자가과 전환 비용을 먼저 정의/);
    // data-od-hangul="1" marking — offline heal 이 전량 rewrite 했음을 표시.
    expect(html).toMatch(/data-od-hangul="1"/);
  });

  it('Block Frame slide-2 를 Coral statement 구조로 오인하지 않는다', () => {
    const body = [
      '<div data-od-slide-flow style="display:flex">',
      '<div class="col-left"><h2 class="nb-heading-md">왜 Teamver인가</h2></div>',
      '<div class="col-right"><div class="intro-card"><h3>맥락 통합</h3><p>업무 맥락을 연결합니다.</p></div></div>',
      '</div>',
    ].join('');
    const filled = fillCoralKitSlide(body, 'class="slide slide-2"', {
      title: '왜 Teamver인가',
      lead: '업무 도구를 하나의 워크스페이스로 연결합니다.',
      bodyText: '팀의 같은 맥락에서 AI와 함께 실행합니다.',
      kicker: '핵심 가치',
      fillLines: [],
    });
    expect(filled).toBe(body);
    expect(filled).not.toMatch(/class="(?:section-label|big-statement|body-text)"/);
  });

  it('이미 붙은 Coral statement tail 을 Block Frame split에서 제거한다', () => {
    const broken = [
      '<section class="slide slide-2">',
      '<div data-od-slide-flow style="display:flex">',
      '<div class="col-left"><h2 class="nb-heading-md">왜 Teamver인가</h2></div>',
      '<div class="col-right"><div class="intro-card"><h3>맥락 통합</h3><p>업무 맥락을 연결합니다.</p></div></div>',
      '<div class="section-label">왜 Teamver인가</div>',
      '<div class="big-statement">업무 도구를 하나로 연결합니다.</div>',
      '<div class="body-text">업무 도구를 하나로 연결합니다.</div>',
      '</div>',
      '</section>',
    ].join('');
    const healed = healBlockFrameLeftoverCatalogCopy(broken, 'Teamver 서비스 소개');
    expect(healed).toMatch(/col-left/);
    expect(healed).toMatch(/col-right/);
    expect(healed).not.toMatch(/class="(?:section-label|big-statement|body-text)"/);
  });

  it('Block Frame stat-card 라벨에 긴 본문을 합치지 않는다', () => {
    const host = [
      '<div class="stats-grid">',
      '<div class="stat-card"><div class="stat-number">00</div><div class="stat-label">demo</div></div>',
      '</div>',
    ].join('');
    const filled = fillAndTrimCardPeers(host, [{
      title: '사례 — 소규모 팀 워크스페이스',
      body: '프로젝트별 자료와 권한, 결정 기록을 같은 공간에서 연결해 운영합니다.',
    }]);
    expect(filled).toMatch(/class="stat-number">01</);
    expect(filled).toMatch(/class="stat-label">소규모 팀/);
    expect(filled).not.toMatch(/프로젝트별 자료와 권한/);
  });

  it('persisted Block Frame stat-label 의 긴 문장도 짧은 의미 라벨로 복구한다', () => {
    const broken = [
      '<section class="slide slide-6">',
      '<h2 class="nb-heading-md">신뢰를 만드는 4가지 증거</h2>',
      '<div class="stats-grid">',
      '<div class="stat-card"><div class="stat-number">02</div>',
      '<div class="stat-label">사례 — 소규모 팀·교육·스타트업·조직 도입 장면과 정성적 효과를 정리한다</div></div>',
      '</div>',
      '</section>',
    ].join('');
    const healed = healBlockFrameLeftoverCatalogCopy(broken, 'Teamver 서비스 소개');
    expect(healed).toMatch(/class="stat-label"[^>]*>소규모 팀·교육/);
    expect(healed).not.toMatch(/정성적 효과를 정리한다/);
  });
});
