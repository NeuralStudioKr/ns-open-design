import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 435 (set67–72 closure)", () => {
  it("dot rem/env/FOO arrows/invent-frame", () => {
    const kitHtml = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:.75rem;border:1px solid navy">a</span>',
      '<p style="padding:var(--p, 16px);border:1px solid teal">b</p>',
      '<span style="padding:.5rem;border:1px solid tomato">thin</span>',
      '<form style="padding:2px;border:1px solid gold">thin-form</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kitHtml);
    expect(bound).toMatch(/\.75rem[^>]*\binfo-card\b|info-card[^>]*\.75rem/i);
    expect(bound).toMatch(/var\(--p[^>]*\binfo-card\b|info-card[^>]*var\(--p/i);
    expect(bound).not.toMatch(/\.5rem[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/thin-form[^>]*\binfo-card\b|padding:2px[^>]*\binfo-card\b/i);
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid navy;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow|border-top/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⇢ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ➤ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
