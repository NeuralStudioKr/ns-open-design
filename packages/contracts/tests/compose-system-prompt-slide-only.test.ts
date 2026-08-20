import { describe, expect, it } from "vitest";

import {
  composeSystemPrompt,
  metadataForTeamverSlideOnlyPrompt,
} from "../src/prompts/system.js";

describe("metadataForTeamverSlideOnlyPrompt", () => {
  it("rewrites stale prototype to deck when media is disabled", () => {
    expect(
      metadataForTeamverSlideOnlyPrompt({ kind: "prototype", entryFile: "index.html" }, { mode: "disabled" }),
    ).toEqual({ kind: "deck", entryFile: "index.html" });
  });

  it("keeps image / video / audio when media is disabled", () => {
    expect(metadataForTeamverSlideOnlyPrompt({ kind: "image" }, { mode: "disabled" })).toEqual({
      kind: "image",
    });
    expect(metadataForTeamverSlideOnlyPrompt({ kind: "video" }, { mode: "disabled" })).toEqual({
      kind: "video",
    });
    expect(metadataForTeamverSlideOnlyPrompt({ kind: "audio" }, { mode: "disabled" })).toEqual({
      kind: "audio",
    });
  });

  it("leaves prototype when media is enabled", () => {
    expect(metadataForTeamverSlideOnlyPrompt({ kind: "prototype" })).toEqual({
      kind: "prototype",
    });
  });
});

describe("composeSystemPrompt — Teamver slide-only BYOK", () => {
  it("treats stale prototype as a deck on the plain API path", () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: "prototype" },
      mediaExecution: { mode: "disabled" },
      streamFormat: "plain",
    });

    expect(prompt).toContain("- **kind**: deck");
    expect(prompt).toContain("- **slideCount**:");
    expect(prompt).toContain("Teamver embed — slide deck scope only");
    expect(prompt).not.toContain("Teamver Design");
    expect(prompt).not.toContain("screen-file-first rule");
    expect(prompt).not.toContain("- **fidelity**:");
    expect(prompt).not.toContain("- **kind**: prototype");
  });

  it("keeps image kind when media execution is disabled", () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: "image" },
      mediaExecution: { mode: "disabled" },
      streamFormat: "plain",
    });

    expect(prompt).toContain("- **kind**: image");
    expect(prompt).not.toContain("- **kind**: deck");
  });

  it("treats stale prototype as a deck on the full (non-plain) path", () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: "prototype" },
      mediaExecution: { mode: "disabled" },
    });

    expect(prompt).toContain("- **kind**: deck");
    expect(prompt).not.toContain("screen-file-first rule");
    expect(prompt).not.toContain("- **kind**: prototype");
  });
});
