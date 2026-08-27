import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 405 (set61–66 closure)", () => {
  it("lvmin/Q/form/FOO/@when/invent-frame", () => {
    const kitHtml = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:2lvmin;border:1px solid navy">a</span>',
      '<form style="padding:8Q;border:1px solid teal">b</form>',
      '<form style="padding:2px;border:1px solid tomato">thin</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kitHtml);
    expect(bound).toMatch(/2lvmin[^>]*\binfo-card\b|info-card[^>]*2lvmin/i);
    expect(bound).toMatch(/<form\b[^>]*8Q[^>]*\binfo-card\b|<form\b[^>]*\binfo-card\b[^>]*8Q/i);
    expect(bound).not.toMatch(/padding:2px[^>]*\binfo-card\b/i);
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid navy;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow|border-top/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 » XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@when (style(--x:1)) {}")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ： XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
