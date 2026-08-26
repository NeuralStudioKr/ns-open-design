import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 44 — LETTERBOX/GLITCH/ZINDEX/SVG chrome leftovers and selective
 * cite/q/kbd kit bind (a/button stay unbound).
 */
describe("chat leak / persist probe round 44 (LETTERBOX · ZINDEX · cite)", () => {
  it("drops LETTERBOX / VIGNETTE / GRAIN / BOKEH chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("LETTERBOX 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PILLARBOX 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MATTE 1 · FRAME")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("VIGNETTE 1 · EDGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GRAIN 1 · NOISE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BOKEH 1 · BLUR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DOF 1 · BLUR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GLITCH 1 · FX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CRT 1 · SCAN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SCANLINE 1 · CRT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DUOTONE 1 · FX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HALFTONE 1 · DOT")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("LETTERBOX 1 · BAR\n레터박스", {
        stripCodeFences: true,
      }),
    ).toBe("레터박스");
  });

  it("drops ZINDEX / TRANSFORM / SVG / CLIPPATH chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("ZINDEX 1 · LAYER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("OPACITY 1 · FADE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("POSITION 1 · ABS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ABSOLUTE 1 · POS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FIXED 1 · POS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STICKY 1 · POS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TRANSFORM 1 · MOVE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TRANSLATE 1 · XY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ROTATE 1 · DEG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SCALE 1 · ZOOM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SVG 1 · ICON")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PATH 1 · SVG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CLIPPATH 1 · MASK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SHADER 1 · FX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WEBGL 1 · 3D")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BEZIER 1 · CURVE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("NOTCH 1 · CUT")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ZINDEX 1 · LAYER\n레이어 순서", {
        stripCodeFences: true,
      }),
    ).toBe("레이어 순서");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("LETTERBOX 비율을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("LETTERBOX 비율을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("SVG 아이콘을 교체함")).toBe(false);
  });

  it("binds card-like cite/q/kbd while keeping thin accents and plain a/button", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<cite style="border:2px solid coral;padding:16px">cite card</cite>',
      '<q style="border:2px solid tomato;padding:12px">q card</q>',
      '<kbd style="border:2px solid gold;padding:20px">kbd card</kbd>',
      '<samp style="border:2px solid coral;padding:16px">samp card</samp>',
      '<small style="border:2px solid tomato;padding:12px">small card</small>',
      '<cite style="border:2px solid coral;padding:2px">thin cite</cite>',
      '<a style="border:2px solid tomato;padding:16px">keep a</a>',
      '<button style="border:2px solid gold;padding:16px">keep button</button>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<cite[^>]*border:2px solid coral[^>]*>cite card/i);
    expect(pinned).not.toMatch(/<q[^>]*border:2px solid tomato[^>]*>q card/i);
    expect(pinned).not.toMatch(/<kbd[^>]*border:2px solid gold[^>]*>kbd card/i);
    expect(pinned).not.toMatch(/<samp[^>]*border:2px solid coral[^>]*>samp card/i);
    expect(pinned).not.toMatch(/<small[^>]*border:2px solid tomato[^>]*>small card/i);
    expect(pinned).toMatch(/<cite[^>]*border:2px solid coral[^>]*>thin cite/i);
    expect(pinned).toMatch(/<a[^>]*border:2px solid tomato[^>]*>keep a/i);
    expect(pinned).toMatch(/<button[^>]*border:2px solid gold[^>]*>keep button/i);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
