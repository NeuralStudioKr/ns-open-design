/**
 * 사용자 리포트 2026-08-31 · 삼각함수 (루프183 candidate → 루프186에서 fix).
 *
 * 사용자 첨부 스크린샷 요약:
 *   - 첫 번째: 슬라이드 1/5, 검은 배경 위에 흐릿한 보라색 "삼각함수" 텍스트만
 *     — MiniMax outline phase의 title-only shell 이 preview 첫 장으로 렌더됨
 *   - 두 번째: 완성된 pitch-deck cover 슬라이드가 이어짐
 *     (kicker · h1 "삼각함수의 언어와 형상" · subtitle · cover-blob)
 *
 * 루프186 fix (`dropLeadingTitleOnlyIntroBeforeRealCover`)가
 * 첫 번째 title-only intro shell 을 drop 하고 실제 cover 만 남겨야 함.
 *
 * 이 파일은 사용자가 제공한 실제 fixture 문자열을 그대로 pin 해 두어,
 * `heal-duplicate-title-only-slide.test.ts` 의 축약 fixture 와는 별개로
 * 실제 사용자 케이스가 회귀하지 않도록 지킨다.
 */

import { describe, expect, it } from 'vitest';
import {
  dropLeadingTitleOnlyIntroBeforeRealCover,
  healAiGeneratedDeckMarkup,
} from '../src/html/heal-ai-generated-deck.js';

// 사용자 fixture 첫 2 슬라이드 verbatim (`/tmp/user-fixture-2026-08-31-loop183.html` 원본).
// 슬라이드 3~5 는 유사 shape 이므로 이 pin 은 leading 부분에 집중.
const USER_2026_08_31_TRIANGULAR_FIXTURE = [
  '<!doctype html><html lang="ko"><head>',
  '<meta charset="utf-8" />',
  '<style data-od-official-motif-deco-css="">',
  '.slide [data-od-official-motif-html].cover-blob{position:absolute;right:0;top:0;width:560px;height:560px;border-radius:50%;background:var(--grad);filter:blur(8px);opacity:.35;z-index:-1}',
  '</style>',
  '<style data-od-deck-fixed-canvas-pin="">',
  'html, body { margin: 0; }',
  '.slide,section.slide,.deck-slide,.ppt-slide,section[data-screen-label],main[data-screen-label],article[data-screen-label]{width:1920px !important;height:1080px !important;box-sizing:border-box !important;overflow:visible !important;contain:layout size;}',
  '</style>',
  '<meta name="viewport" content="width=1920, initial-scale=1, maximum-scale=1" /></head>',
  '<body class="tpl-pitch-deck" style="margin:0">',
  // 슬라이드 1 — outline phase 의 title-only shell (MiniMax fill 실패로 남은 껍데기)
  '<section class="slide slide-title" style="width:1920px;height:1080px;box-sizing:border-box;overflow:visible;display:flex;flex-direction:column;justify-content:center;padding:80px 88px">',
  ' <div data-od-slide-flow="" style="display:flex;flex-direction:column;justify-content:center;overflow:visible;padding:80px 88px;box-sizing:border-box"> <h1>삼각함수</h1></div>',
  '</section>',
  // 슬라이드 2 — MiniMax fill 완료된 실제 pitch-deck cover
  '<section class="slide" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#ffffff;color:#0d1130;padding:56px 72px">',
  '<div data-od-slide-flow="" style="color:#0d1130;padding:56px 72px;box-sizing:border-box">',
  ' <div class="cover-bg" style="position:relative;background:linear-gradient(135deg,#eef1ff 0%,#f4edff 55%,#fbedff 100%);z-index:0"></div>',
  ' <div style="position:relative;display:flex;align-items:center;font-size:13px;color:#4a5070;letter-spacing:.14em;text-transform:uppercase;z-index:3"><span class="brand-dot" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:linear-gradient(135deg,#3b5bff,#7a46ff);margin-right:10px"></span><span style="font-weight:600">Math Basics</span></div>',
  ' <div style="position:relative;font-size:13px;color:#8a90ad;letter-spacing:.14em;text-transform:uppercase;z-index:3">Lesson 01 / 06</div>',
  ' <div style="position:relative;transform:translateY(-50%);max-width:1100px;z-index:2">',
  ' <p class="kicker" style="margin:0 0 22px;font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#7a46ff;font-weight:600">삼각함수 입문</p>',
  ' <h1 class="h1" style="margin:0 0 28px;font-family:\'Playfair Display\',\'Noto Serif SC\',\'Noto Serif KR\',serif;font-weight:900;font-size:140px;line-height:.95;letter-spacing:-.04em;color:#0d1130">삼각함수의<br>언어와 형상</h1>',
  ' <p style="margin:0;max-width:780px;font-size:24px;line-height:1.55;color:#4a5070">직각삼각형의 변 길이 비에서 시작해, 단위원 위의 회전과 파동으로 확장되는 삼각함수의 핵심 어휘와 쓰임을 한 번에 정리합니다.</p>',
  ' </div>',
  ' <div style="position:relative;display:flex;gap:32px;align-items:center;z-index:3;font-size:13px;color:#8a90ad;letter-spacing:.1em;text-transform:uppercase"><span>Education · 2025</span><span style="width:6px;height:6px;border-radius:50%;background:#3b5bff"></span><span>High School → University Bridge</span></div>',
  '</div>',
  '<div class="cover-blob" style="position:absolute;right:0;top:0;width:620px;height:620px;border-radius:50%;background:linear-gradient(135deg,#3b5bff 0%,#7a46ff 55%,#d94cff 100%);filter:blur(10px);opacity:.35;z-index:1"></div>',
  '</section>',
  '</body></html>',
].join('\n');

const USER_BRIEF = '삼각함수에 대해서 설명하는 피피티 만들어줘.';

function countSlides(html: string): number {
  return (html.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
}

describe('사용자 리포트 2026-08-31 · 삼각함수 fixture pin (루프186 회귀 방어)', () => {
  it('첫 outline shell 이 실제 cover 뒤에 붙어있을 때 shell 만 drop 된다', () => {
    const before = countSlides(USER_2026_08_31_TRIANGULAR_FIXTURE);
    expect(before).toBe(2);
    expect(USER_2026_08_31_TRIANGULAR_FIXTURE).toContain('class="slide slide-title"');
    expect(USER_2026_08_31_TRIANGULAR_FIXTURE).toContain('data-screen-label="01 Cover"');

    const out = dropLeadingTitleOnlyIntroBeforeRealCover(USER_2026_08_31_TRIANGULAR_FIXTURE, USER_BRIEF);
    expect(countSlides(out)).toBe(1);
    expect(out).not.toContain('class="slide slide-title"');
    expect(out).toContain('data-screen-label="01 Cover"');
    expect(out).toContain('삼각함수의<br>언어와 형상');
  });

  it('healAiGeneratedDeckMarkup 로 전체 파이프라인 통과 시 결과가 실제 cover 만 남는다', () => {
    const out = healAiGeneratedDeckMarkup(USER_2026_08_31_TRIANGULAR_FIXTURE, USER_BRIEF);
    expect(countSlides(out)).toBe(1);
    // 사용자가 첫 페이지에서 본 title-only shell 이 사라져야 preview 가 실제 cover 를 첫 장으로 표시
    expect(out).not.toMatch(/<section[^>]*\bslide-title\b/);
    // 실제 cover 의 kicker · h1 · subtitle 은 보존
    expect(out).toContain('삼각함수 입문');
    expect(out).toContain('삼각함수의<br>언어와 형상');
    expect(out).toContain('직각삼각형의 변 길이 비에서 시작해');
    // 앵커 없는 translateY(-50%) 제거 (루프186-b) — cover 컨텐츠가 상단 clip 되지 않아야 함
    expect(out).not.toContain('translateY(-50%)');
  });

  it('두 번째 heal pass 는 결과를 바꾸지 않는다 (idempotent)', () => {
    const once = healAiGeneratedDeckMarkup(USER_2026_08_31_TRIANGULAR_FIXTURE, USER_BRIEF);
    const twice = healAiGeneratedDeckMarkup(once, USER_BRIEF);
    expect(twice).toBe(once);
  });

  it('cover 슬라이드의 그라디언트 blob 은 그대로 유지 (paper surface 오탐 없음)', () => {
    const out = healAiGeneratedDeckMarkup(USER_2026_08_31_TRIANGULAR_FIXTURE, USER_BRIEF);
    // cover 자체는 흰색 배경 인라인 유지 (루프180 파이프라인 담당)
    expect(out).toContain('background:#ffffff');
    // 장식용 cover-blob 은 그라디언트 유지 (heal 스코프 밖 · 정상)
    expect(out).toContain('class="cover-blob"');
    expect(out).toContain('background:linear-gradient(135deg,#3b5bff 0%,#7a46ff 55%,#d94cff 100%)');
  });
});
