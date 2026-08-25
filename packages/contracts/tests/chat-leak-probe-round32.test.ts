import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 32 — UNIT / STEP / MODULE / SECTION / ACT / SCENE / PHASE leftovers
 * after PART / CHAPTER (round29–31) were scrubbed. Also EPISODE / BLOCK /
 * FRAME / SESSION dialects MiniMax still emits.
 */
describe("chat leak probe round 32 (UNIT/STEP/MODULE · ACT/SCENE · EPISODE)", () => {
  it("drops UNIT / STEP / MODULE / SECTION track chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("UNIT 2 · AGENDA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STEP 03 · OUTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MODULE 01 · INTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SECTION 2 · TRACK")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("UNIT 2 · AGENDA\n다음 단원입니다.", {
        stripCodeFences: true,
      }),
    ).toBe("다음 단원입니다.");
    expect(
      sanitizeAssistantProseForDisplay("STEP 03 · OUTRO", { stripCodeFences: true }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("MODULE 01 · INTRO\n모듈 소개", {
        stripCodeFences: true,
      }),
    ).toBe("모듈 소개");
    expect(
      sanitizeAssistantProseForDisplay("SECTION 2 · TRACK", { stripCodeFences: true }),
    ).toBe("");
  });

  it("drops ACT / SCENE / PHASE track chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("ACT 1 · HOOK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SCENE 04 · BODY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PHASE 2 · CLOSING")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ACT 1 · HOOK\n오프닝", { stripCodeFences: true }),
    ).toBe("오프닝");
    expect(
      sanitizeAssistantProseForDisplay("SCENE 04 · BODY", { stripCodeFences: true }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("PHASE 2 · CLOSING", { stripCodeFences: true }),
    ).toBe("");
  });

  it("drops EPISODE / BLOCK / FRAME / SESSION track chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("EPISODE 01 · INTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BLOCK 2 · AGENDA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FRAME 03 · COVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SESSION 3 · BODY")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("EPISODE 01 · INTRO\n에피소드", {
        stripCodeFences: true,
      }),
    ).toBe("에피소드");
    expect(
      sanitizeAssistantProseForDisplay("BLOCK 2 · AGENDA", { stripCodeFences: true }),
    ).toBe("");
  });

  it("scrubs modern color-function debris lines (oklab / color())", () => {
    expect(
      sanitizeAssistantProseForDisplay("초안.\noklab(0.6 0.1 0.05)", {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay("초안.\ncolor(display-p3 0.2 0.5 0.9)", {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
  });

  it("keeps legitimate prose that mentions those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("UNIT 테스트는 빠르게 돌려야 합니다.", {
        stripCodeFences: true,
      }),
    ).toBe("UNIT 테스트는 빠르게 돌려야 합니다.");
    expect(
      sanitizeAssistantProseForDisplay("이 SECTION 은 요약입니다.", {
        stripCodeFences: true,
      }),
    ).toBe("이 SECTION 은 요약입니다.");
    expect(looksLikeDeckCodeDebrisLine("UNIT 테스트는 빠르게")).toBe(false);
  });
});
