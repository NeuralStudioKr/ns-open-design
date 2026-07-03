import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("FileViewer streaming slide preview", () => {
  it("gates live iframe updates on repaired html stability during streaming", () => {
    const source = readSource("src/components/FileViewer.tsx");

    expect(source).toContain("repairArtifactDocumentHead(candidate)");
    expect(source).toContain("isArtifactHtmlStableForPreview(repaired)");
    expect(source).toContain("repairArtifactDocumentHead(liveHtml)");
    expect(source).toContain("artifact-preview-streaming-veil");
    expect(source).toContain("is-streaming-unstable");
  });
});
