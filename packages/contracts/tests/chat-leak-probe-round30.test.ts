import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 30 — CHAPTER track chrome and single-digit index leftovers
 * MiniMax still emits after PAGE/SEC generalization.
 */
describe("chat leak probe round 30 (CHAPTER chrome · single-digit badges)", () => {
  it("drops CHAPTER track chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("CHAPTER 01 · COVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHAPTER · OUTRO")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료됨.\nCHAPTER 01 · COVER", {
        stripCodeFences: true,
      }),
    ).toBe("완료됨.");
  });

  it("drops single-digit index-badge leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("5 / CHECKLIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("5 · SUMMARY")).toBe(true);
    expect(sanitizeAssistantProseForDisplay("5 / CHECKLIST", { stripCodeFences: true })).toBe(
      "",
    );
  });

  it("keeps numbered markdown and Hangul status", () => {
    expect(
      sanitizeAssistantProseForDisplay("요약.\n1. 차트 추가\n- 다음 단계", {
        stripCodeFences: true,
      }),
    ).toBe("요약.\n1. 차트 추가\n- 다음 단계");
    expect(
      sanitizeAssistantProseForDisplay("슬라이드 추가 중\n차트 축 라벨을 확인하세요", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중\n차트 축 라벨을 확인하세요");
  });
});
