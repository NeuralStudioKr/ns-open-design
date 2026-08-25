import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 33 — APPENDIX/TABLE/TOPIC/TRACK/PANEL/CARD/BEAT/LESSON leftovers
 * and hwb() invented frames after round32 modern-color bind.
 */
describe("chat leak / persist probe round 33 (APPENDIX · hwb frames)", () => {
  it("drops APPENDIX / TABLE / TOPIC / TRACK chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("APPENDIX 01 · NOTES")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("APPENDIX A · NOTES")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TABLE 2 · DATA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOPIC 03 · BODY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TRACK 1 · INTRO")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("APPENDIX A · NOTES\n부록입니다.", {
        stripCodeFences: true,
      }),
    ).toBe("부록입니다.");
    expect(
      sanitizeAssistantProseForDisplay("TABLE 2 · DATA", { stripCodeFences: true }),
    ).toBe("");
  });

  it("drops PANEL / CARD / BEAT / LESSON / CLIP / ROUND chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("PANEL 2 · AGENDA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CARD 01 · COVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BEAT 3 · HOOK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LESSON 04 · BODY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CLIP 2 · OUTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ROUND 1 · INTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PASS 02 · REVIEW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("NOTE 1 · ASIDE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("LESSON 04 · BODY\n본문", {
        stripCodeFences: true,
      }),
    ).toBe("본문");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("CARD 컴포넌트를 재사용하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("CARD 컴포넌트를 재사용하세요.");
    expect(looksLikeDeckCodeDebrisLine("TRACK 변경이 필요합니다")).toBe(false);
  });

  it("binds hwb and outline/oklch invented frames to kit cards", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="outline:2px solid oklch(0.6 0.2 250);padding:12px">outline oklch</div>',
      '<div style="border:2px solid hwb(200 30% 20%);padding:12px">hwb</div>',
      '<figure style="border:2px solid hwb(40 10% 5%);padding:12px">hwb fig</figure>',
      '<div style="border:1px solid var(--border);padding:12px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/solid\s+oklch\(/i);
    expect(pinned).not.toMatch(/solid\s+hwb\(/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
