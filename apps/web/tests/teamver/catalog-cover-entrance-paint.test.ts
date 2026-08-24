/**
 * @vitest-environment jsdom
 *
 * String-contains tests cannot see opacity:0. Catalog thumbs must paint
 * official entrance covers at the finished end state.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  isolateFirstDeckSlideHtml,
  pluginCatalogPreviewSrcDoc,
} from "../../src/teamver/htmlCoverSrcDoc";

const repoRoot = resolve(import.meta.dirname, "../../../..");

function paintSrcDoc(html: string): void {
  document.open();
  document.write(html);
  document.close();
}

afterEach(() => {
  document.documentElement.innerHTML = "";
});

describe("catalog cover entrance paint", () => {
  it("paints compacted Studio [data-anim] nodes at opacity 1", () => {
    const html = readFileSync(
      resolve(repoRoot, "plugins/_official/examples/html-ppt-zhangzara-studio/example.html"),
      "utf8",
    );
    const compacted = isolateFirstDeckSlideHtml(html);
    paintSrcDoc(
      pluginCatalogPreviewSrcDoc(compacted, "/api/plugins/example-html-ppt-zhangzara-studio/preview"),
    );
    const nodes = [...document.querySelectorAll("[data-anim]")];
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      const style = getComputedStyle(node);
      expect(style.opacity, node.textContent?.trim().slice(0, 24)).toBe("1");
      expect(style.visibility).toBe("visible");
    }
    expect(document.body.textContent).toMatch(/PROPOSAL/);
  });

  it("paints official anim-fade-up covers that use fill-mode both", () => {
    const html = readFileSync(
      resolve(repoRoot, "plugins/_official/examples/html-ppt-pitch-deck/example.html"),
      "utf8",
    );
    paintSrcDoc(
      pluginCatalogPreviewSrcDoc(html, "/api/plugins/example-html-ppt-pitch-deck/preview"),
    );
    const title = document.querySelector(".anim-fade-up");
    expect(title).toBeTruthy();
    expect(getComputedStyle(title!).opacity).toBe("1");
    expect(getComputedStyle(title!).visibility).toBe("visible");
    expect(title?.textContent).toMatch(/solo founders/i);
  });
});
