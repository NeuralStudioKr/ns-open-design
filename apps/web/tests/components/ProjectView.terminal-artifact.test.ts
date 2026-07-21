import { describe, expect, it } from "vitest";

import { isIncompleteHtmlDocumentShell } from "../../src/artifacts/validate";
import { resolveTerminalArtifactToPersist } from "../../src/components/ProjectView";

const INCOMPLETE_SHELL = "\n<!doctype html>\n<html lang=\"ko\">\n<head>";

const COMPLETE_HTML = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>Deck</title></head>
<body><main><h1>Slide</h1><p>Content long enough to pass validation gate.</p></main></body>
</html>`;

describe("resolveTerminalArtifactToPersist", () => {
  it("prefers a complete standalone document over an incomplete parsed shell", () => {
    const result = resolveTerminalArtifactToPersist(
      {
        identifier: "ai-enterprise-deck",
        title: "Deck",
        artifactType: "text/html",
        html: INCOMPLETE_SHELL,
      },
      `plan text\n\`\`\`html\n${COMPLETE_HTML}\n\`\`\``,
      (text) => ({
        identifier: "response",
        title: "Response",
        artifactType: "text/html",
        html: COMPLETE_HTML,
      }),
    );

    expect(result?.html).toBe(COMPLETE_HTML);
    expect(isIncompleteHtmlDocumentShell(result?.html ?? "")).toBe(false);
  });

  it("keeps the incomplete parsed shell when no better standalone exists", () => {
    const parsed = {
      identifier: "ai-enterprise-deck",
      title: "Deck",
      artifactType: "text/html",
      html: INCOMPLETE_SHELL,
    };
    const result = resolveTerminalArtifactToPersist(parsed, "plan only", () => null);
    expect(result).toEqual(parsed);
  });
});
