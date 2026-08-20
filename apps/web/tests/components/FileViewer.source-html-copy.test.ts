import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const fileViewer = readFileSync(
  join(here, "../../src/components/FileViewer.tsx"),
  "utf8",
);

describe("FileViewer HTML source copy (staging)", () => {
  it("wires staging-gated copy control on the source tab", () => {
    expect(fileViewer).toContain("isTeamverSourceHtmlCopyEnabled");
    expect(fileViewer).toContain('data-testid="html-source-copy-button"');
    expect(fileViewer).toContain("copyHtmlSourceToClipboard");
    expect(fileViewer).toContain("sourceHtmlCopyEnabled && mode === 'source'");
  });
});
