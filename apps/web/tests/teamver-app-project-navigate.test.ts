import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("App navigateToProject conversation restore", () => {
  it("threads remembered conversation id into the project route when opening from home", () => {
    const source = readSource("src/App.tsx");
    expect(source).toContain("readRememberedTeamverProjectConversation");
    expect(source).toMatch(
      /const resolvedConversationId[\s\S]{0,280}conversationId: resolvedConversationId \?\? null/,
    );
  });
});
