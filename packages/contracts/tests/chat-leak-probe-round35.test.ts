import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 35 — slide-role chrome (HOOK/OUTRO/AGENDA/SCREEN/…) leftovers and
 * MiniMax named-color frames (coral/tomato/rebeccapurple/…) after round34.
 */
describe("chat leak / persist probe round 35 (HOOK/AGENDA · named colors)", () => {
  it("drops HOOK / OUTRO / INTRO / CLOSING / OPENING / FINALE / WRAP chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("HOOK 1 · OPEN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("OUTRO 02 · END")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("INTRO 1 · START")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CLOSING 1 · END")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("OPENING 1 · HI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FINALE 1 · BOW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WRAP 1 · END")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("HOOK 1 · OPEN\n오프닝", {
        stripCodeFences: true,
      }),
    ).toBe("오프닝");
  });

  it("drops SCREEN / TASK / WORKSHOP / DECK / MOTIF chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("SCREEN 2 · HOME")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TASK 03 · TODO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WORKSHOP 2 · LAB")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DECK 01 · COVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MOTIF 1 · MARK")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DECK 01 · COVER\n표지", {
        stripCodeFences: true,
      }),
    ).toBe("표지");
  });

  it("drops SUMMARY / RECAP / AGENDA / COVER / CHECKLIST chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("SUMMARY 01 · RECAP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RECAP 2 · END")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("AGENDA 1 · LIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COVER 01 · TITLE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHECKLIST 1 · TODO")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("AGENDA 1 · LIST\n목차", {
        stripCodeFences: true,
      }),
    ).toBe("목차");
  });

  it("drops TAKEAWAY / QNA / GOAL / THESIS / TIP / EXAMPLE chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("TAKEAWAY 2 · KEY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("KEYTAKE 1 · POINT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QNA 1 · ASK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QA 01 · ASK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GOAL 1 · AIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("THESIS 1 · CLAIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TIP 2 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WARNING 1 · CAUTION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EXAMPLE 1 · SAMPLE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CASE 1 · STUDY")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("TAKEAWAY 2 · KEY\n핵심", {
        stripCodeFences: true,
      }),
    ).toBe("핵심");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("AGENDA를 먼저 공유하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("AGENDA를 먼저 공유하세요.");
    expect(looksLikeDeckCodeDebrisLine("TIP: 차트를 확인하세요")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("GOAL 문서를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("GOAL 문서를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("TASK 준비가 필요합니다")).toBe(false);
  });

  it("binds coral/tomato/rebeccapurple/gold invented frames to kit cards", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="border:2px solid coral;padding:12px">coral</div>',
      '<div style="border:2px solid tomato;padding:12px">tomato</div>',
      '<div style="border:2px solid rebeccapurple;padding:12px">rebecca</div>',
      '<div style="border:2px solid deepskyblue;padding:12px">deepsky</div>',
      '<div style="border:2px solid gold;padding:12px">gold</div>',
      '<div style="border:2px solid turquoise;padding:12px">turquoise</div>',
      '<div style="border:1px solid var(--border);padding:12px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/border:2px solid coral/i);
    expect(pinned).not.toMatch(/border:2px solid tomato/i);
    expect(pinned).not.toMatch(/border:2px solid rebeccapurple/i);
    expect(pinned).not.toMatch(/border:2px solid deepskyblue/i);
    expect(pinned).not.toMatch(/border:2px solid gold/i);
    expect(pinned).not.toMatch(/border:2px solid turquoise/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("binds main/blockquote/ul coral frames without touching plain p/span", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<main style="border:2px solid coral;padding:12px">main</main>',
      '<blockquote style="border:2px solid tomato;padding:12px">quote</blockquote>',
      '<ul><li style="border:2px solid gold;padding:8px">item</li></ul>',
      '<p style="border:2px solid coral;padding:8px">keep p</p>',
      '<span style="border:2px solid tomato;padding:8px">keep span</span>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<main[^>]*solid\s+coral/i);
    expect(pinned).not.toMatch(/<blockquote[^>]*solid\s+tomato/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral/);
    expect(pinned).toMatch(/<span[^>]*border:2px solid tomato/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
