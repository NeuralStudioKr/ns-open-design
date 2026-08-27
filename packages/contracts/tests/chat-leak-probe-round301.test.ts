import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 301 (kit blockquote/address selective)", () => {
  it("does not force kit card on thin blockquote/address without card-like padding", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<blockquote style="margin:0">quote</blockquote>',
      '<address style="font-style:normal">addr</address>',
      '<hgroup style="display:block"><h2>t</h2></hgroup>',
      '<search style="display:block">s</search>',
      '<s style="text-decoration:line-through">old</s>',
      '<u style="text-decoration:underline">u</u>',
      "</section>",
    ].join("");
    const out = pinDeckSlidesToFixedCanvas(html);
    expect(out).not.toMatch(/<blockquote[^>]*data-od-kit-card/i);
    expect(out).not.toMatch(/<address[^>]*data-od-kit-card/i);
    expect(out).not.toMatch(/<hgroup[^>]*data-od-kit-card/i);
    expect(out).not.toMatch(/<search[^>]*data-od-kit-card/i);
  });
});
