import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas, bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 375 (set55–60 closure)", () => {
  it("calc padding kit, section selective, FOO arrows, invent-frame off", () => {
    const kitHtml = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:calc(12px + 0px);border:1px solid navy">card</section>',
      '<section style="padding:2px;border:1px solid tomato">thin</section>',
      '<span style="padding:2lvh;border:1px solid teal">lvh</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kitHtml);
    expect(bound).toMatch(/<section\b[^>]*calc\(12px[^>]*\binfo-card\b|<section\b[^>]*\binfo-card\b[^>]*calc\(12px/i);
    expect(bound).not.toMatch(/padding:2px[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/2lvh[^>]*\binfo-card\b|info-card[^>]*2lvh/i);
    const flowHtml = [
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid navy;background-color:snow;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(flowHtml).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow/i);
    expect(flow).not.toMatch(/border-top/i);
    expect(flow).not.toMatch(/background-color/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 → XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ＝ XYZ\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
