import { describe, expect, it } from 'vitest';

import {
  closeIncompleteDeckArtifactForSalvage,
  incompleteDeckHasSalvageableSlides,
  isCompleteDeckArtifactText,
} from '../src/html/incomplete-deck-artifact';

const HOW_TO_INCOMPLETE = [
  '<artifact type="deck" identifier="deck">',
  '<!doctype html><html lang="ko"><head>',
  '<style data-od-official-look-css>.s-cover .titlewrap{bottom:80px}</style>',
  '</head><body>',
  '<section class="slide s-cover"><h1>왜 쓸모 있는 글이 필요한가</h1>',
  '<p>첫 문장이 기대를 잡지 못하면 독자는 3초 안에 떠난다.</p></section>',
  '<section class="slide"><h2>첫 문장</h2><p>호기심을 한 줄에 압축한다.</p></section>',
  '<section class="slide"><h2>한 메시지</h2><p>문단마다 한 가지 결만 남긴다.</p></section>',
].join('');

describe('1007-N01 슬라이스 J — incomplete official-rich salvage', () => {
  it('미닫힘 how-to 리치 덱은 구조 태그만 닫아 complete 로 만든다', () => {
    expect(isCompleteDeckArtifactText(HOW_TO_INCOMPLETE)).toBe(false);
    expect(incompleteDeckHasSalvageableSlides(HOW_TO_INCOMPLETE)).toBe(true);
    const closed = closeIncompleteDeckArtifactForSalvage(HOW_TO_INCOMPLETE);
    expect(closed).toBeTruthy();
    expect(isCompleteDeckArtifactText(closed!)).toBe(true);
    expect(closed).toContain('왜 쓸모 있는 글이 필요한가');
    expect(closed).toContain('</body></html></artifact>');
    expect(closed).not.toContain('feature-card');
    expect((closed!.match(/<section\b[^>]*\bslide\b/g) ?? []).length).toBe(3);
  });

  it('head-only preamble 는 salvage 하지 않는다 (JSON LOOK 도 아님)', () => {
    const headOnly = [
      '<artifact type="deck" identifier="deck">',
      '<!doctype html><html lang="ko"><head><style>.x{}</style></head>',
    ].join('');
    expect(incompleteDeckHasSalvageableSlides(headOnly)).toBe(false);
    expect(closeIncompleteDeckArtifactForSalvage(headOnly)).toBeNull();
  });

  it('이미 complete 한 덱은 그대로 반환한다', () => {
    const complete = `${HOW_TO_INCOMPLETE}</body></html></artifact>`;
    expect(isCompleteDeckArtifactText(complete)).toBe(true);
    expect(closeIncompleteDeckArtifactForSalvage(complete)).toBe(complete);
  });
});
