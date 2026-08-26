import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 42 — RIBBON/WATERMARK/SCRIM chrome leftovers, lh/cap/ex/vb card-like
 * padding, and selective fieldset/legend/dialog/menu kit bind.
 */
describe("chat leak / persist probe round 42 (RIBBON · lh · fieldset)", () => {
  it("drops RIBBON / WATERMARK / KICKER / MASTHEAD chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("RIBBON 1 · TAG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STICKER 1 · BADGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WATERMARK 1 · MARK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EMBLEM 1 · SEAL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FAVICON 1 · ICON")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("THUMBNAIL 1 · PREVIEW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PLACEHOLDER 1 · SLOT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("KICKER 1 · EYE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EYEBROW 1 · LABEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SUBHEAD 1 · LINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BYLINE 1 · AUTHOR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MASTHEAD 1 · TOP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("JUMBOTRON 1 · HERO")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("RIBBON 1 · TAG\n리본 장식", {
        stripCodeFences: true,
      }),
    ).toBe("리본 장식");
  });

  it("drops SCRIM / GLOW / DIVIDER / CONTAINER chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("SCRIM 1 · DIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("VEIL 1 · FADE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HAZE 1 · SOFT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GLOW 1 · LIGHT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("AURA 1 · RING")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BEZEL 1 · EDGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DIVIDER 1 · LINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SEPARATOR 1 · RULE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HAIRLINE 1 · THIN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ORNAMENT 1 · DECOR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ACCENT 1 · LINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WRAPPER 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CONTAINER 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SHELL 1 · OUTER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHROME 1 · UI")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("SCRIM 1 · DIM\n스크림", {
        stripCodeFences: true,
      }),
    ).toBe("스크림");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("RIBBON 배지를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("RIBBON 배지를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("CONTAINER 값을 줄임")).toBe(false);
  });

  it("binds lh/cap/ex/vb card-like p frames while keeping thin accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="border:2px solid coral;padding:2lh">lh p</p>',
      '<p style="border:2px solid tomato;padding:3cap">cap p</p>',
      '<span style="border:2px solid gold;padding:2ex">ex span</span>',
      '<p style="border:2px solid coral;padding:2vb">vb p</p>',
      '<p style="border:2px solid tomato;padding:2ic">ic p</p>',
      '<p style="border:2px solid coral;padding:1lh">thin lh</p>',
      '<p style="border:2px solid tomato;padding:1.5ex">thin ex</p>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>lh p/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid tomato[^>]*>cap p/i);
    expect(pinned).not.toMatch(/<span[^>]*border:2px solid gold[^>]*>ex span/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>vb p/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid tomato[^>]*>ic p/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral[^>]*>thin lh/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid tomato[^>]*>thin ex/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("binds card-like fieldset/legend/dialog/menu while keeping thin accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<fieldset style="border:2px solid coral;padding:16px">fieldset card</fieldset>',
      '<legend style="border:2px solid tomato;padding:12px">legend card</legend>',
      '<dialog style="border:2px solid gold;padding:20px">dialog card</dialog>',
      '<menu style="border:2px solid coral;padding:16px">menu card</menu>',
      '<fieldset style="border:2px solid coral;padding:2px">thin fieldset</fieldset>',
      '<strong style="border:2px solid tomato;padding:16px">keep strong</strong>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<fieldset[^>]*border:2px solid coral[^>]*>fieldset card/i);
    expect(pinned).not.toMatch(/<legend[^>]*border:2px solid tomato[^>]*>legend card/i);
    expect(pinned).not.toMatch(/<dialog[^>]*border:2px solid gold[^>]*>dialog card/i);
    expect(pinned).not.toMatch(/<menu[^>]*border:2px solid coral[^>]*>menu card/i);
    expect(pinned).toMatch(/<fieldset[^>]*border:2px solid coral[^>]*>thin fieldset/i);
    expect(pinned).toMatch(/<strong[^>]*border:2px solid tomato[^>]*>keep strong/i);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
