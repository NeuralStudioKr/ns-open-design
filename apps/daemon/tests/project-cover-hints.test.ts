import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveProjectCoverHint } from "../src/project-cover-hints.js";

describe("resolveProjectCoverHint", () => {
  let tmpRoot = "";

  afterEach(async () => {
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = "";
    }
  });

  it("returns coverVersion from cover file mtime", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "od-cover-hint-"));
    const projectId = "proj-cover";
    const projectDir = path.join(tmpRoot, projectId);
    await fs.mkdir(projectDir, { recursive: true });
    const htmlPath = path.join(projectDir, "index.html");
    await fs.writeFile(htmlPath, "<html><body>slide</body></html>", "utf8");
    const st = await fs.stat(htmlPath);

    const hint = await resolveProjectCoverHint(tmpRoot, projectId, {
      metadata: { kind: "deck", entryFile: "index.html" },
    });

    expect(hint).toMatchObject({
      entryFile: "index.html",
      coverKind: "html",
      coverPath: "index.html",
      coverVersion: Math.round(st.mtimeMs),
    });
  });

  it("returns html cover from shallow scan when metadata is empty", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "od-cover-hint-"));
    const projectId = "proj-fs-only";
    const projectDir = path.join(tmpRoot, projectId);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, "index.html"), "<html></html>", "utf8");

    const hint = await resolveProjectCoverHint(tmpRoot, projectId, { metadata: {} });

    expect(hint).toMatchObject({
      entryFile: "index.html",
      coverKind: "html",
      coverPath: "index.html",
    });
  });

  it("rejects metadata entry paths outside the project directory", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "od-cover-hint-"));
    const projectId = "proj-contained";
    const projectDir = path.join(tmpRoot, projectId);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(tmpRoot, "outside.html"), "<html>outside</html>", "utf8");

    const hint = await resolveProjectCoverHint(tmpRoot, projectId, {
      metadata: { kind: "deck", entryFile: "../outside.html" },
    });

    expect(hint).toBeNull();
  });

  it("rejects metadata entry URL and drive-letter paths", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "od-cover-hint-"));
    const projectId = "proj-url-path";
    await fs.mkdir(path.join(tmpRoot, projectId), { recursive: true });

    await expect(
      resolveProjectCoverHint(tmpRoot, projectId, {
        metadata: { kind: "deck", entryFile: "https://example.com/deck.html" },
      }),
    ).resolves.toBeNull();
    await expect(
      resolveProjectCoverHint(tmpRoot, projectId, {
        metadata: { kind: "deck", entryFile: "C:\\temp\\deck.html" },
      }),
    ).resolves.toBeNull();
  });
});
