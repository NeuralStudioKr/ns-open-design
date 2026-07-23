import { describe, expect, it } from "vitest";

import {
  normalizeBodyFirstHtmlDocument,
  salvageTruncatedHtmlDocument,
} from "../../src/artifacts/recover";
import { isIncompleteHtmlDocumentShell } from "../../src/artifacts/validate";

describe("salvageTruncatedHtmlDocument", () => {
  it("closes a truncated deck that already has real slide sections", () => {
    const truncated = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>AI 도입 효과</title>
<style>.slide{padding:40px}</style></head>
<body>
<section class="slide"><h1>기업 AI 도입 효과</h1><p>개요 설명입니다.</p></section>
<section class="slide"><h2>생산성</h2><ul><li>업무 자동화</li><li>의사결정 지원</li></ul></section>
<section class="slide"><h2>비용 절감</h2><p>운영비 감소 사례`;

    const salvaged = salvageTruncatedHtmlDocument(truncated);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toMatch(/<\/body>\s*<\/html>\s*$/i);
    expect(isIncompleteHtmlDocumentShell(salvaged!)).toBe(false);
  });

  it("does not salvage an empty head-only shell", () => {
    const shell =
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>x</title></head><body>";
    expect(salvageTruncatedHtmlDocument(shell)).toBeNull();
  });

  it("does not salvage SLOT-comment-only slide skeletons", () => {
    const slotOnly = `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>Deck</title>
<style>.slide{padding:40px}</style></head><body>
<section class="slide"><!-- SLOT: slide 1 content --></section>
<section class="slide"><!-- SLOT: slide 2 content --></section>`;
    expect(salvageTruncatedHtmlDocument(slotOnly)).toBeNull();
  });

  it("does not touch an already-closed complete document", () => {
    const complete = `<!doctype html><html><head><title>ok</title></head><body>
<section class="slide"><h1>Done</h1><p>Complete slide copy here.</p></section>
</body></html>`;
    expect(salvageTruncatedHtmlDocument(complete)).toBeNull();
  });

  it("wraps body-first compact deck artifacts into a complete document", () => {
    const bodyFirst =
      '<body style="margin:0">'
      + '<section class="slide"><h1>AI 도입 효과</h1><p>업무 생산성 개선을 설명합니다.</p></section>'
      + '<section class="slide"><h2>비용 절감</h2><p>반복 업무 자동화로 운영비를 낮춥니다.</p></section>';
    const normalized = normalizeBodyFirstHtmlDocument(bodyFirst);
    expect(normalized).toMatch(/^<!doctype html><html lang="ko"><body/i);
    expect(normalized).toMatch(/<\/body><\/html>$/);
    expect(isIncompleteHtmlDocumentShell(normalized!)).toBe(false);
  });

  it("wraps slide-section-first compact deck artifacts into a complete document", () => {
    const sectionFirst =
      '<section class="slide" style="min-height:100vh"><h1>온보딩</h1><p>첫날 체크리스트입니다.</p></section>'
      + '<section class="slide"><h2>협업 방식</h2><p>팀 문화와 커뮤니케이션 규칙을 소개합니다.</p></section>';
    const normalized = normalizeBodyFirstHtmlDocument(sectionFirst);
    expect(normalized).toContain('<body><section class="slide"');
    expect(normalized).toMatch(/<\/body><\/html>$/);
  });

  it("does not wrap empty or SLOT-only body-first deck shells", () => {
    expect(
      normalizeBodyFirstHtmlDocument('<body><section class="slide"></section></body>'),
    ).toBeNull();
    expect(
      normalizeBodyFirstHtmlDocument(
        '<section class="slide"><!-- SLOT: slide 1 content --></section>'
        + '<section class="slide"><!-- SLOT: slide 2 content --></section>',
      ),
    ).toBeNull();
  });
});
