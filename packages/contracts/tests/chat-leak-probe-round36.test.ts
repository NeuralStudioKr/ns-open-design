import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 36 — pitch-deck role chrome (OVERVIEW/KPI/CTA/…) leftovers,
 * expanded named-color frames, and standalone `color: tomato;` prop dumps.
 */
describe("chat leak / persist probe round 36 (OVERVIEW/KPI · firebrick · prop dump)", () => {
  it("drops OVERVIEW / PROBLEM / SOLUTION / FEATURE chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("OVERVIEW 1 · MAP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CONTEXT 02 · BG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PROBLEM 1 · PAIN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SOLUTION 1 · FIX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FEATURE 2 · LIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BENEFIT 1 · WIN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("PROBLEM 1 · PAIN\n문제 정의", {
        stripCodeFences: true,
      }),
    ).toBe("문제 정의");
  });

  it("drops METRIC / KPI / CHART / COMPARE / TIMELINE / CTA chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("METRIC 01 · KPI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("KPI 1 · CHART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHART 2 · DATA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STATS 1 · NUM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COMPARE 1 · VS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PROS 1 · LIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CONS 1 · LIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TIMELINE 1 · ROAD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ROADMAP 1 · PLAN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PROCESS 1 · FLOW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CTA 1 · ACTION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RESOURCES 1 · LINK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("REFERENCE 1 · SRC")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("CTA 1 · ACTION\n다음 단계", {
        stripCodeFences: true,
      }),
    ).toBe("다음 단계");
  });

  it("scrubs standalone CSS prop dumps after Hangul status", () => {
    expect(looksLikeDeckCodeDebrisLine("color: tomato;")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("margin: 0 auto;")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("초안.\ncolor: tomato;", {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay("완료됨.\nmargin: 0;", {
        stripCodeFences: true,
      }),
    ).toBe("완료됨.");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("KPI 대시보드를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("KPI 대시보드를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("CTA 문구를 짧게")).toBe(false);
  });

  it("binds firebrick/orangered/khaki invented frames to kit cards", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="border:2px solid firebrick;padding:12px">firebrick</div>',
      '<div style="border:2px solid orangered;padding:12px">orangered</div>',
      '<div style="border:2px solid khaki;padding:12px">khaki</div>',
      '<div style="border:2px solid slategray;padding:12px">slategray</div>',
      '<div style="border:1px solid var(--border);padding:12px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/border:2px solid firebrick/i);
    expect(pinned).not.toMatch(/border:2px solid orangered/i);
    expect(pinned).not.toMatch(/border:2px solid khaki/i);
    expect(pinned).not.toMatch(/border:2px solid slategray/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
