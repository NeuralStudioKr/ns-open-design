import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 34 — QUOTE/FAQ/DEMO/TOC chrome leftovers and device-cmyk /
 * light-dark invented frames after round33 APPENDIX/hwb.
 */
describe("chat leak / persist probe round 34 (QUOTE/FAQ · device-cmyk)", () => {
  it("drops QUOTE / ASIDE / CALL / HINT / FAQ chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("QUOTE 1 · PULL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ASIDE 02 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CALL 3 · OUT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HINT 1 · TIP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FAQ 01 · Q")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FAQ 01 · Q\n자주 묻는 질문", {
        stripCodeFences: true,
      }),
    ).toBe("자주 묻는 질문");
  });

  it("drops LAB / DEMO / DRILL / INDEX / TOC / MAP / BRIEF chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("LAB 2 · DEMO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DEMO 03 · LIVE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DRILL 1 · PRACTICE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("INDEX 1 · TOC")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOC 01 · MENU")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MAP 2 · OVERVIEW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BRIEF 1 · GOAL")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DEMO 03 · LIVE\n시연", {
        stripCodeFences: true,
      }),
    ).toBe("시연");
  });

  it("scrubs device-cmyk / light-dark debris lines", () => {
    expect(
      sanitizeAssistantProseForDisplay("초안.\ndevice-cmyk(0.2 0.7 0 0)", {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay("초안.\nlight-dark(red, blue)", {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FAQ 문서를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FAQ 문서를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("DEMO 준비가 필요합니다")).toBe(false);
  });

  it("binds device-cmyk and light-dark invented frames to kit cards", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="border:2px solid device-cmyk(0.2 0.7 0 0);padding:12px">cmyk</div>',
      '<div style="outline:2px solid light-dark(hwb(200 20% 10%), hwb(200 80% 5%));padding:12px">ld</div>',
      '<div style="border:1px solid var(--border);padding:12px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/solid\s+device-cmyk\(/i);
    expect(pinned).not.toMatch(/solid\s+light-dark\(/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
