import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 72 — background extras, transform, transition, animation, offset flow.
 */
describe("chat leak / persist probe round 72 (background-clip · animation)", () => {
  it("copies background extras and transform into slide flow", () => {
    const html = [
      '<section class="slide" style="background-clip:text;background-origin:border-box;background-attachment:fixed;background-blend-mode:multiply;background-position-x:left;background-position-y:top;mask-type:luminance;mask-border:url(x);transform:scale(1);transform-origin:center;transform-box:fill-box;perspective-origin:center;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/background-clip:\s*text/i);
    expect(flowOpen).toMatch(/background-origin:\s*border-box/i);
    expect(flowOpen).toMatch(/background-attachment:\s*fixed/i);
    expect(flowOpen).toMatch(/background-blend-mode:\s*multiply/i);
    expect(flowOpen).toMatch(/background-position-x:\s*left/i);
    expect(flowOpen).toMatch(/background-position-y:\s*top/i);
    expect(flowOpen).toMatch(/mask-type:\s*luminance/i);
    expect(flowOpen).toMatch(/mask-border:\s*url\(x\)/i);
    expect(flowOpen).toMatch(/transform:\s*scale\(1\)/i);
    expect(flowOpen).toMatch(/transform-origin:\s*center/i);
    expect(flowOpen).toMatch(/transform-box:\s*fill-box/i);
    expect(flowOpen).toMatch(/perspective-origin:\s*center/i);
  });

  it("copies transition/animation/offset into slide flow", () => {
    const html = [
      '<section class="slide" style="transition:all .2s;transition-property:opacity;transition-duration:200ms;transition-delay:10ms;transition-timing-function:ease-out;transition-behavior:allow-discrete;animation:spin 1s;animation-name:spin;animation-duration:1s;animation-delay:0s;animation-timing-function:linear;animation-iteration-count:infinite;animation-direction:alternate;animation-fill-mode:both;animation-play-state:running;animation-composition:accumulate;offset:path(M0 0);offset-position:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/transition:\s*all \.2s/i);
    expect(flowOpen).toMatch(/transition-property:\s*opacity/i);
    expect(flowOpen).toMatch(/transition-duration:\s*200ms/i);
    expect(flowOpen).toMatch(/transition-behavior:\s*allow-discrete/i);
    expect(flowOpen).toMatch(/animation:\s*spin 1s/i);
    expect(flowOpen).toMatch(/animation-name:\s*spin/i);
    expect(flowOpen).toMatch(/animation-duration:\s*1s/i);
    expect(flowOpen).toMatch(/animation-iteration-count:\s*infinite/i);
    expect(flowOpen).toMatch(/animation-composition:\s*accumulate/i);
    expect(flowOpen).toMatch(/offset:\s*path\(M0 0\)/i);
    expect(flowOpen).toMatch(/offset-position:\s*auto/i);
  });
});
