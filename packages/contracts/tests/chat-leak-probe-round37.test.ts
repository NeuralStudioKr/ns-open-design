import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 37 — LAYOUT/HERO/NAV chrome leftovers and selective p/span/h2
 * card-like fake frames (padding ≥12px) without body-accent false positives.
 */
describe("chat leak / persist probe round 37 (LAYOUT/HERO · selective p/span)", () => {
  it("drops LAYOUT / GRID / COLUMN / ROW chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("LAYOUT 1 · GRID")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GRID 2 · COLS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COLUMN 1 · LEFT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ROW 2 · TOP")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("LAYOUT 1 · GRID\n레이아웃", {
        stripCodeFences: true,
      }),
    ).toBe("레이아웃");
  });

  it("drops HERO / BANNER / HEADER / FOOTER / NAV / MENU chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("HERO 1 · BANNER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BANNER 1 · TOP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HEADER 1 · NAV")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOTER 1 · META")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("NAV 1 · MENU")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MENU 2 · LIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SIDEBAR 1 · ASIDE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOOLBAR 1 · ACTS")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("HERO 1 · BANNER\n히어로", {
        stripCodeFences: true,
      }),
    ).toBe("히어로");
  });

  it("drops BADGE / TAG / LABEL / CAPTION / FIGURE / IMAGE / ICON chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("BADGE 1 · TAG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TAG 2 · LABEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LABEL 1 · NAME")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CAPTION 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FIGURE 1 · IMG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("IMAGE 1 · ART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ICON 1 · MARK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SPRITE 1 · SVG")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ICON 1 · MARK\n아이콘", {
        stripCodeFences: true,
      }),
    ).toBe("아이콘");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("NAV 구조를 먼저 잡으세요.", {
        stripCodeFences: true,
      }),
    ).toBe("NAV 구조를 먼저 잡으세요.");
    expect(looksLikeDeckCodeDebrisLine("HERO 이미지를 교체")).toBe(false);
  });

  it("binds card-like p/span/h2 coral frames but keeps thin body accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="border:2px solid coral;padding:16px">card p</p>',
      '<span style="border:2px solid tomato;padding:20px;display:block">card span</span>',
      '<h2 style="border:2px solid gold;padding:12px">card h2</h2>',
      '<p style="border:2px solid coral;padding:2px">thin p accent</p>',
      '<span style="border:2px solid tomato;padding:4px">thin span</span>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>card p/i);
    expect(pinned).not.toMatch(/<span[^>]*border:2px solid tomato[^>]*>card span/i);
    expect(pinned).not.toMatch(/<h2[^>]*border:2px solid gold/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral[^>]*>thin p accent/i);
    expect(pinned).toMatch(/<span[^>]*border:2px solid tomato[^>]*>thin span/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
