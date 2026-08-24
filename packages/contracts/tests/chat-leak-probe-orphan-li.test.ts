import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * User report 2026-08-24 — zhangzara/studio deck body (`<!-- Left: intro -->`,
 * orphan `<li>`, mismatched `<div>…</p>`) leaked into the assistant bubble.
 */
const ZHANGZARA_LINUX_MASTER_DUMP = [
  `<div>/ 2급</p>`,
  `<!-- Left: intro -->`,
  `<!-- Right: 2-grade cards --> <li>1차: 객관식 100문항 (커널·파일시스템·네트워크·보안)</li>`,
  `<li>2차: 단답형·서술형 60문항 (실무 설정·스크립트)</li>`,
  `<li>응시 자격: 2급 취득자 또는 관련 학과 졸업(예정)자</li>`,
  `<li>합격 기준: 과목별 40점 이상, 평균 60점 이상</li>`,
  `<!-- Col 1: 2급 범위 --> <li><strong>기본 명령어</strong>: ls, cp, mv, chmod, chown, find</li>`,
  `<li><strong>사용자 관리</strong>: useradd, passwd, /etc/passwd, /etc/shadow</li>`,
  `용 & 다음 단계 (dark) --> <!-- Left: statement -->`,
  `<li>공공기관·공기업 IT 직렬 채용 가산점</li>`,
  `LEVEL</p>`,
  `<li>CentOS / Rocky Linux 서버 운영</li>`,
  `<div>`,
  `<div>`,
  `<div> <div>`,
  `<div>원 · 2차 실기: 57,200원</p>`,
  `<!-- Right: registration steps + tips -->`,
  `<div>`,
  `<li><strong>KAIT 홈페이지</strong> (www.ihd.or.kr) 회원 가입</li>`,
  `<li>원서 접수 기간 내 <strong>온라인 접수 + 수수료 결제</strong></li>`,
].join("\n");

function looksLikeDeckBodyDebris(out: string): boolean {
  return /<\/?[a-zA-Z]|<!--|-->|<li\b|<div\b/i.test(out);
}

describe("chat leak probe — orphan li / layout comment dumps", () => {
  it("scrubs user-reported zhangzara linux-master body dump", () => {
    expect(sanitizeAssistantProseForDisplay(ZHANGZARA_LINUX_MASTER_DUMP).trim()).toBe("");
    expect(
      sanitizeAssistantProseForDisplay(`초안을 다듬는 중입니다.\n\n${ZHANGZARA_LINUX_MASTER_DUMP}`),
    ).toBe("초안을 다듬는 중입니다.");
  });

  it("scrubs streaming and history the same for layout comments + li", () => {
    const history = sanitizeAssistantProseForDisplay(ZHANGZARA_LINUX_MASTER_DUMP, {
      stripCodeFences: true,
    });
    const streaming = sanitizeAssistantProseForDisplay(ZHANGZARA_LINUX_MASTER_DUMP, {
      stripCodeFences: true,
      streaming: true,
    });
    expect(looksLikeDeckBodyDebris(history)).toBe(false);
    expect(looksLikeDeckBodyDebris(streaming)).toBe(false);
  });

  it("keeps markdown lists and headings", () => {
    expect(sanitizeAssistantProseForDisplay("요약.\n# 다음 단계\n- 차트 추가")).toBe(
      "요약.\n# 다음 단계\n- 차트 추가",
    );
  });
});
