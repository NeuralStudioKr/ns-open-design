import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 545 (set89–93 closure)", () => {
  it("vh/%+px / FOO stars / invent-frame", () => {
    const kitHtml = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1vh + 8px);border:1px solid navy">a</span>',
      '<p style="padding:calc(2% + 8px);border:1px solid teal">b</p>',
      '<span style="padding:calc(0.4vh + 2px);border:1px solid tomato">thin</span>',
      '<form style="padding:2px;border:1px solid gold">thin-form</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kitHtml);
    expect(bound).toMatch(/1vh \+ 8px[^>]*\binfo-card\b|info-card[^>]*1vh \+ 8px/i);
    expect(bound).toMatch(/2% \+ 8px[^>]*\binfo-card\b|info-card[^>]*2% \+ 8px/i);
    expect(bound).not.toMatch(/0\.4vh \+ 2px[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/padding:2px[^>]*\binfo-card\b/i);
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid navy;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow|border-top/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ▲ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ◉ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ★ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
