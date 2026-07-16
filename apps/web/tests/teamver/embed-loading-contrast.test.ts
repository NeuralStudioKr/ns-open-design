import { describe, expect, it } from "vitest";

import {
  isChunkLoadError,
} from "../../src/teamver/embedChunkLoadRecovery";
import {
  TEAMVER_EMBED_LOADING_BG,
  TEAMVER_EMBED_LOADING_TEXT,
} from "../../src/teamver/branding/loadingShellLabel";

describe("embed loading shell contrast", () => {
  it("uses a darker text color on cream background", () => {
    expect(TEAMVER_EMBED_LOADING_TEXT).toBe("#5c574f");
    expect(TEAMVER_EMBED_LOADING_BG).toBe("#F4EFE6");
    expect(TEAMVER_EMBED_LOADING_TEXT).not.toBe("#8a857c");
  });
});

describe("embedChunkLoadRecovery", () => {
  it("detects webpack chunk load failures", () => {
    expect(
      isChunkLoadError(
        new Error("Loading chunk 1234 failed. (missing: /_next/static/chunks/foo.js)"),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new Error("network down"))).toBe(false);
  });
});
