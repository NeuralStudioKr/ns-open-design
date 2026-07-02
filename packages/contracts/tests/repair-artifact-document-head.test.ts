import { describe, expect, it } from "vitest";

import { repairArtifactDocumentHead } from "../src/html/repairArtifactDocumentHead.js";

const HERMES_CORRUPT = `<!doctype html>
<html lang="ko">
<head>device-width, initial-scale=1" />
  <title>Hermes</title>
</head>
<body><div class="slide">A</div></body>
</html>`;

describe("repairArtifactDocumentHead", () => {
  it("repairs truncated viewport meta immediately after <head>", () => {
    const out = repairArtifactDocumentHead(HERMES_CORRUPT);
    expect(out).not.toMatch(/<head>\s*device-width/i);
    expect(out).toContain('content="width=device-width, initial-scale=1"');
    expect(out).toContain("<meta charset");
    expect(out).toContain("<title>Hermes</title>");
  });

  it("is idempotent on valid documents", () => {
    const valid = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title></head><body></body></html>`;
    const once = repairArtifactDocumentHead(valid);
    const twice = repairArtifactDocumentHead(once);
    expect(twice).toBe(once);
  });

  it("strips viewport fragments leaked into body after a corrupted head", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
device-width, initial-scale=1" />
<div class="slide">A</div></body></html>`;
    const out = repairArtifactDocumentHead(leaked);
    expect(out).not.toMatch(/<body>\s*[\n\r]*\s*device-width/i);
    expect(out).toContain('<div class="slide">A</div>');
    expect(out).toContain('<meta name="viewport"');
  });

  it("strips viewport fragments leaked inside a deck wrapper", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body><div class="deck">
device-width, initial-scale=1" >
<section class="slide">A</section></div></body></html>`;
    const out = repairArtifactDocumentHead(leaked);
    expect(out).not.toMatch(/<div class="deck">\s*device-width/i);
    expect(out).toContain('<section class="slide">A</section>');
    expect(out).toContain('<meta name="viewport"');
  });

  it("preserves valid viewport meta while stripping leaked tails", () => {
    const html =
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title></head><body><div class="deck">device-width, initial-scale=1" /><section class="slide">A</section></div></body></html>';
    const out = repairArtifactDocumentHead(html);
    expect(out).toContain('content="width=device-width, initial-scale=1"');
    expect(out).not.toMatch(/<div class="deck">\s*device-width/i);
  });
});
