import { describe, expect, it } from "vitest";
import {
  looksLikeDeckPatchSelfTalk,
  sanitizeAssistantProseForDisplay,
  stripDeckPatchSelfTalkProse,
} from "../src/agent-prose-sanitize.js";

/** 0915-N01 — user-reported English patch monologue in Korean UI chat. */
const USER_REPORTED_PATCH_SELF_TALK = `I'm checking the slide that needs the patch — slide 9 (index 8). The "[Studio X] Guidelines" appears as a label/caption text on the closing slide, not as a card title. Looking at the current HTML, it's just an <span> label. I need to identify what card with a title-only body needs filling.

Looking at the slide content, it's a .slide--fadelist slide with "Before / During / After" items and "the session" as the fadelist-title. The "[Studio X] Guidelines" is currently a mono label that needs to become a real content element with body copy describing the guidelines.

I'll patch that slide by upgrading the label into a proper guidelines card with body content.`;

describe("chat-leak-probe-round922 deck patch self-talk (0915-N01)", () => {
  it("detects the user-reported English patch monologue", () => {
    expect(looksLikeDeckPatchSelfTalk(USER_REPORTED_PATCH_SELF_TALK)).toBe(true);
  });

  it("strips the monologue from assistant display sanitizer", () => {
    expect(sanitizeAssistantProseForDisplay(USER_REPORTED_PATCH_SELF_TALK, {
      stripCodeFences: true,
    }).trim()).toBe("");
  });

  it("keeps a short Hangul outcome when mixed with English self-talk", () => {
    const mixed = `${USER_REPORTED_PATCH_SELF_TALK}\n\n9페이지 가이드라인 문구를 보강했습니다.`;
    expect(stripDeckPatchSelfTalkProse(mixed).trim()).toBe(
      "9페이지 가이드라인 문구를 보강했습니다.",
    );
    expect(
      sanitizeAssistantProseForDisplay(mixed, { stripCodeFences: true }).trim(),
    ).toBe("9페이지 가이드라인 문구를 보강했습니다.");
  });

  it("does not strip ordinary design decision prose", () => {
    const ok = "I tightened the closing slide hierarchy so the guidelines read as body copy, not a caption.";
    expect(looksLikeDeckPatchSelfTalk(ok)).toBe(false);
    expect(sanitizeAssistantProseForDisplay(ok, { stripCodeFences: true }).trim()).toBe(ok);
  });
});
