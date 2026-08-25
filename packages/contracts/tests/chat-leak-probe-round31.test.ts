import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 31 (PART · figure hsl)", () => {
  it("drops PART track chrome and keeps numbered markdown", () => {
    expect(looksLikeDeckCodeDebrisLine("PART 01 · OUTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHAPTER 1 · COVER")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료됨.\nPART 01 · OUTRO", { stripCodeFences: true }),
    ).toBe("완료됨.");
    expect(
      sanitizeAssistantProseForDisplay("요약.\n1. 차트 추가", { stripCodeFences: true }),
    ).toBe("요약.\n1. 차트 추가");
  });

  it("binds figure comma-hsl frames to kit cards", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<figure style="border:2px solid hsl(239, 84%, 67%);padding:16px">Comma HSL</figure>',
      '<ol><li style="outline:2px solid hsl(221 83% 53%);padding:12px">Space HSL li</li></ol>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/hsl\(239/);
    expect(pinned).not.toMatch(/hsl\(221/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
