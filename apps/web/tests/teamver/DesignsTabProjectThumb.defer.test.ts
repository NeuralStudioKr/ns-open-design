import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "../../src/teamver/components/DesignsTabProjectThumb.tsx"),
  "utf8",
);

describe("DesignsTabProjectThumb viewport defer", () => {
  it("disables nested ProjectCardHtmlCover IntersectionObserver", () => {
    expect(source).toContain("deferUntilVisible={false}");
    expect(source).toContain("second IntersectionObserver only delayed");
  });
});
