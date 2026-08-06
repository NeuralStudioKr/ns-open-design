import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "../../src/teamver/useLazyProjectCover.ts"),
  "utf8",
);

describe("useLazyProjectCover fetch deps", () => {
  it("does not depend on the full project object identity for cover resolve", () => {
    expect(source).toContain("projectRef");
    expect(source).toContain("Intentionally omit full `project`");
    // Effect deps must use stable identity keys, not `project`.
    expect(source).toMatch(
      /\[allowFilesFallback,\s*projectId,\s*entryFile,\s*visible,\s*fetched\]/,
    );
    expect(source).not.toMatch(/\}, \[allowFilesFallback, project, visible, fetched\]/);
  });
});
