import { describe, expect, it } from "vitest";

import { salvageTruncatedHtmlDocument } from "../../src/artifacts/recover";
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

  it("does not touch an already-closed complete document", () => {
    const complete = `<!doctype html><html><head><title>ok</title></head><body>
<section class="slide"><h1>Done</h1><p>Complete slide copy here.</p></section>
</body></html>`;
    expect(salvageTruncatedHtmlDocument(complete)).toBeNull();
  });
});
