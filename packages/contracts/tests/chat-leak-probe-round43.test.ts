import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 43 — BLEED/PARALLAX/DRAFT chrome leftovers, pt/mm print padding,
 * and selective h1/h5/h6/mark/time kit bind.
 */
describe("chat leak / persist probe round 43 (BLEED · pt · h1)", () => {
  it("drops BLEED / SAFEAREA / MARGIN / GAP chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("BLEED 1 · EDGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TRIM 1 · EDGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SAFEAREA 1 · MARGIN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MARGIN 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PADDING 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GAP 1 · SPACE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SPACING 1 · SPACE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CROP 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("THUMB 1 · IMG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PREVIEW 1 · VIEW")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("BLEED 1 · EDGE\n재단선", {
        stripCodeFences: true,
      }),
    ).toBe("재단선");
  });

  it("drops PARALLAX / KEYFRAME / DRAFT / TODO chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("PARALLAX 1 · DEPTH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("KENBURNS 1 · ZOOM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("REVEAL 1 · ANIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STAGGER 1 · DELAY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("KEYFRAME 1 · ANIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EASING 1 · CURVE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SPRING 1 · MOTION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FILTER 1 · FX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BLEND 1 · MODE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COMPOSITE 1 · LAYER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DRAFT 1 · WIP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WIP 1 · DRAFT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TODO 1 · TASK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FIXME 1 · BUG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MOCK 1 · DATA")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("PARALLAX 1 · DEPTH\n시차 효과", {
        stripCodeFences: true,
      }),
    ).toBe("시차 효과");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("BLEED 영역을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("BLEED 영역을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("TODO 목록을 정리함")).toBe(false);
  });

  it("binds pt/mm/cm card-like p frames while keeping thin accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="border:2px solid coral;padding:12pt">pt p</p>',
      '<p style="border:2px solid tomato;padding:4mm">mm p</p>',
      '<span style="border:2px solid gold;padding:0.5cm">cm span</span>',
      '<p style="border:2px solid coral;padding:1pc">pc p</p>',
      '<p style="border:2px solid tomato;padding:2pt">thin pt</p>',
      '<p style="border:2px solid coral;padding:1mm">thin mm</p>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>pt p/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid tomato[^>]*>mm p/i);
    expect(pinned).not.toMatch(/<span[^>]*border:2px solid gold[^>]*>cm span/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>pc p/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid tomato[^>]*>thin pt/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral[^>]*>thin mm/i);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("binds card-like h1/h5/mark while keeping thin accents and plain strong", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<h1 style="border:2px solid coral;padding:16px">h1 card</h1>',
      '<h5 style="border:2px solid tomato;padding:12px">h5 card</h5>',
      '<mark style="border:2px solid gold;padding:20px">mark card</mark>',
      '<time style="border:2px solid coral;padding:16px">time card</time>',
      '<h1 style="border:2px solid coral;padding:2px">thin h1</h1>',
      '<strong style="border:2px solid tomato;padding:16px">keep strong</strong>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<h1[^>]*border:2px solid coral[^>]*>h1 card/i);
    expect(pinned).not.toMatch(/<h5[^>]*border:2px solid tomato[^>]*>h5 card/i);
    expect(pinned).not.toMatch(/<mark[^>]*border:2px solid gold[^>]*>mark card/i);
    expect(pinned).not.toMatch(/<time[^>]*border:2px solid coral[^>]*>time card/i);
    expect(pinned).toMatch(/<h1[^>]*border:2px solid coral[^>]*>thin h1/i);
    expect(pinned).toMatch(/<strong[^>]*border:2px solid tomato[^>]*>keep strong/i);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
