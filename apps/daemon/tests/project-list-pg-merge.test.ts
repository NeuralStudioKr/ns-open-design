import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const daemonRoot = resolve(import.meta.dirname, "..");

describe("postgres project listing merge", () => {
  it("keeps RDS rows authoritative over node-local cache on listing", () => {
    const db = readFileSync(resolve(daemonRoot, "src/db.ts"), "utf8");
    const start = db.indexOf("async function listMergedProjectsPostgres");
    expect(start).toBeGreaterThan(0);
    const block = db.slice(start, start + 900);
    expect(block).toContain("if (byId.has(id)) continue");
    expect(block).not.toMatch(
      /project\.updatedAt > existing\.updatedAt/,
    );
  });
});
