import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const registry = readFileSync(join(here, "../../src/providers/registry.ts"), "utf8");

describe("restoreProjectFileRevision cover bust", () => {
  it("clears project cover cache after successful HTML restore (SSOT with write/push)", () => {
    const start = registry.indexOf("export async function restoreProjectFileRevision");
    expect(start).toBeGreaterThan(0);
    const block = registry.slice(start, start + 1_800);
    expect(block).toContain("clearProjectCoverCache(projectId)");
    expect(block).toMatch(/\.html\?\$\/i\.test\(fileName\)/);
  });
});
