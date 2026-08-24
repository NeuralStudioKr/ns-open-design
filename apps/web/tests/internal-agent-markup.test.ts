import { describe, expect, it } from "vitest";

import {
  sanitizeAssistantProseForDisplay,
  sanitizeLeakedAgentProse,
  stripInternalOpenDesignMarkup,
  stripTrailingOpenInternalMarkup,
} from "../src/runtime/internalAgentMarkup";
import { stripLeakedPseudoToolXml } from "../src/utils/stripLeakedPseudoToolXml";
import { sanitizeChatMessageLeakedPseudoTool } from "../src/utils/sanitizeChatMessageLeakedPseudoTool";

describe("internalAgentMarkup", () => {
  it("hard-strips Capsule motif pills and broken section CSS via web display path", () => {
    const leaked = [
      '<div style="position:absolute;border-radius:9999px;border:2px solid ',
      "#1E1E1E;display:flex;align-items:center;justify-content:center;",
      "font-family:'Space Grotesk',sans-serif;font-weight:700;",
      'background:#C5B5E0;width:140px;height:60px;top:22%;right:10%">Nx</div>',
      '<div style="position:absolute;border-radius:9999px;background:#8BB4F7">PNPM WS</div>',
      "</div>",
      "</section>-weight:700;margin-bottom:6px\">🔴 Git 성능 저하</div>",
      '<div class="card" style="padding:24px 파이프라인 복잡도</div>',
    ].join("\n");
    for (const streaming of [true, false]) {
      expect(sanitizeAssistantProseForDisplay(`초안을 다듬는 중입니다.\n\n${leaked}`, { streaming })).toBe(
        "초안을 다듬는 중입니다.",
      );
      expect(sanitizeAssistantProseForDisplay(leaked, { streaming }).trim()).toBe("");
    }
  });

  it("hard-strips quoted font-family / flex mid-style debris via web display path", () => {
    const leaked = [
      "align-items:center;justify-content:center;",
      "font-family:'Space Grotesk',sans-serif;font-weight:700;",
      'background:#C5B5E0;width:140px;height:60px;top:22%;right:10%">Nx</div>',
    ].join("");
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`초안을 다듬는 중입니다.\n\n${leaked}`, { streaming }),
      ).toBe("초안을 다듬는 중입니다.");
      expect(sanitizeAssistantProseForDisplay(leaked, { streaming }).trim()).toBe("");
    }
  });

  it("hard-strips mid-style attribute debris that appears after reload", () => {
    const frag = [
      "px;left:60px;font-size:28px;font-weight:700;color:",
      '#7ECDC0;letter-spacing:3px;text-transform:uppercase">Senior Engineer Series</div>',
    ].join("\n");
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`슬라이드 초안을 준비했습니다.\n\n${frag}`, { streaming }),
      ).toBe("슬라이드 초안을 준비했습니다.");
      expect(sanitizeAssistantProseForDisplay(frag, { streaming }).trim()).toBe("");
    }
  });

  it("hard-strips mid-SVG CSS even when </style> was truncated on reload", () => {
    const cssOnlyNoClose = ["none;stroke:", "#232323;stroke-width:2.0"].join("\n");
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`진행.\n${cssOnlyNoClose}`, { streaming }),
      ).toBe("진행.");
    }
  });

  it("hard-strips Daisy badge span + motif comment + mid SVG CSS after reload", () => {
    const frag = [
      '<span style="background:',
      "#FDE68A;border:3px solid ",
      "#2D2D2D;border-radius:20px;padding:10px 28px;font-size:24px;font-family:'Quicksand',sans-serif;font-weight:700;box-shadow:4px 4px 0 ",
      '#2D2D2D">Internal Team</span>',
      "</div>",
      "<!-- Daisy motif TL -->none;stroke:",
      "#232323;stroke-width:2.0745;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:10;}.cls-3{fill:",
      "#FFFFFF;stroke:",
      "#232323;stroke-width:2.0745;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:10;}</style>",
    ].join("\n");
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`슬라이드 초안을 준비했습니다.\n\n${frag}`, { streaming }),
      ).toBe("슬라이드 초안을 준비했습니다.");
      expect(sanitizeAssistantProseForDisplay(frag, { streaming }).trim()).toBe("");
    }
  });

  it("hard-strips unknown utility CSS continuations via web stale-dist fallback", () => {
    const frag = [
      ".tag.inv{border-color:rgba(28,28,28,0.35);color:",
      "#1c1c1c}",
      ".chip.on{padding:4px 10px;background:#eee}",
    ].join("\n");
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`초안을 다듬는 중입니다.\n\n${frag}`, { streaming }),
      ).toBe("초안을 다듬는 중입니다.");
      expect(sanitizeAssistantProseForDisplay(frag, { streaming }).trim()).toBe("");
    }
  });

  it("hard-strips Barlow typography chrome + mid-word CSS join after reload", () => {
    const frag = [
      `<span style="font-family:'Barlow','Noto Sans SC',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,210,0,0.58)">Engineering Deep Dive</span>`,
      `</div> <div style="flex:1;display:flex;flex-direction:column;gap:32px;">`,
      `<div style="font-family:'Barlow';font-size:108px;font-weight:900;text-transform:uppercase">CLOUD</div>`,
    ].join("\n");
    const midWord =
      '슬라이드 추가 중ospace;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.5;margin-bottom:18px">Observability in Depth</div>';
    const singleBarlow =
      `초안.\n\n<span style="font-family:'Barlow';font-size:14px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase">Engineering Deep Dive</span>`;
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`초안을 다듬는 중입니다.\n\n${frag}`, { streaming }),
      ).toBe("초안을 다듬는 중입니다.");
      expect(sanitizeAssistantProseForDisplay(frag, { streaming }).trim()).toBe("");
      expect(sanitizeAssistantProseForDisplay(midWord, { streaming })).toBe("슬라이드 추가 중");
      expect(sanitizeAssistantProseForDisplay(singleBarlow, { streaming })).toBe("초안.");
    }
  });

  it("hard-strips deck chrome family via web last-pass (flex/landmarks/closers)", () => {
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(
          `<div style="display:flex;flex-direction:column;gap:32px">x</div>`,
          { streaming },
        ),
      ).toBe("");
      expect(
        sanitizeAssistantProseForDisplay(`진행.\n</div></div></section>`, { streaming }),
      ).toBe("진행.");
      expect(
        sanitizeAssistantProseForDisplay(
          `<footer style="position:absolute;bottom:48px;left:64px">1 / 12</footer>`,
          { streaming },
        ),
      ).toBe("");
      expect(
        sanitizeAssistantProseForDisplay(`초안.\n--bg:#0f172a;--fg:#fff;--accent:#c96442;`, {
          streaming,
        }),
      ).toBe("초안.");
      const tagInv = `.tag.inv{border-color:rgba(28,28,28,0.35);color:\n#1c1c1c}`;
      expect(sanitizeAssistantProseForDisplay(`초안.\n${tagInv}`, { streaming })).toBe("초안.");
    }
  });

  it("hard-strips leftover Daisy SVG primitives via web display last-pass", () => {
    const leaked = [
      '<circle cx="90" cy="90" r="40" fill="#7ECDC0"/>',
      '<rect x="8" y="12" width="160" height="40" rx="20"/>',
      '<defs><linearGradient id="g1"><stop offset="0"/></linearGradient></defs>',
      '<text x="24" y="48">Nx</text></svg>',
    ].join("\n");
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`도형 넣는 중.\n${leaked}`, { streaming }),
      ).toBe("도형 넣는 중.");
      expect(sanitizeAssistantProseForDisplay(leaked, { streaming }).trim()).toBe("");
    }
  });

  it("hard-strips kit CSS at-rules via web display last-pass", () => {
    const leaked = [
      "@keyframes deco-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}",
      "@font-face{font-family:'Space Grotesk';src:url(https://fonts.gstatic.com/x.woff2)}",
      "@supports (display:grid){.slide{display:grid}}",
    ].join("\n");
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`덱을 구성합니다.\n\n${leaked}`, { streaming }),
      ).toBe("덱을 구성합니다.");
      expect(sanitizeAssistantProseForDisplay(leaked, { streaming }).trim()).toBe("");
    }
  });

  it("hard-strips Daisy SVG / deco-class shells via web display path", () => {
    const leaked = [
      '<div class="deco-daisy">',
      '<svg class="deco-daisy" viewBox="0 0 180 180" style="position:absolute;top:8%;right:6%">',
      '<path d="M90 20 C110 40 110 60 90 80 C70 60 70 40 90 20 Z"></path>',
      "</svg>",
    ].join("\n");
    for (const streaming of [true, false]) {
      expect(
        sanitizeAssistantProseForDisplay(`초안을 다듬는 중입니다.\n\n${leaked}`, { streaming }),
      ).toBe("초안을 다듬는 중입니다.");
      expect(sanitizeAssistantProseForDisplay(leaked, { streaming }).trim()).toBe("");
    }
  });

  it("keeps motif HTML inside an open streaming artifact", () => {
    const input = [
      "초안.",
      '<artifact identifier="deck.html">',
      '<div style="position:absolute;border-radius:9999px">Nx</div>',
    ].join("\n");
    const out = sanitizeAssistantProseForDisplay(input, { streaming: true });
    expect(out).toContain("<artifact");
    expect(out).toContain("position:absolute");
  });

  it("keeps motif HTML inside an uppercase streaming ARTIFACT tag", () => {
    const input = [
      "초안.",
      '<ARTIFACT identifier="deck.html">',
      '<div style="position:absolute;border-radius:9999px">Nx</div>',
    ].join("\n");
    const out = sanitizeAssistantProseForDisplay(input, { streaming: true });
    expect(out).toContain("<ARTIFACT");
    expect(out).toContain("position:absolute");
  });

  it("hard-strips classic keydown/click deck-nav JS via web display path", () => {
    const leaked = [
      "(function(){",
      "document.addEventListener('keydown',function(e){",
      "document.addEventListener('click',function(e){",
      "if(e.clientX>window.innerWidth/2)go(cur+1);else",
    ].join("\n");
    for (const streaming of [true, false]) {
      const out = sanitizeAssistantProseForDisplay(`완료.\n${leaked}`, { streaming });
      expect(out).toBe("완료.");
      expect(sanitizeAssistantProseForDisplay(leaked, { streaming }).trim()).toBe("");
    }
  });

  it("strips answer_operator / task_analysis from assistant prose", () => {
    const input = [
      "<answer_operator>",
      "<task_analysis>hidden plan</task_analysis>",
      "</answer_operator>",
      "본문",
    ].join("\n");
    expect(stripInternalOpenDesignMarkup(input)).toBe("본문");
  });

  it("strips closed odTodoWrite blocks from assistant prose", () => {
    const input = [
      "Planning the deck.",
      "<odTodoWrite>",
      '[{"id":"1","text":"Pick layout","status":"in_progress"}]',
      "</odTodoWrite>",
      "Starting slide 1.",
    ].join("\n");
    const out = stripInternalOpenDesignMarkup(input);
    expect(out).not.toContain("<odTodoWrite");
    expect(out).not.toContain("Pick layout");
    expect(out).toContain("Planning the deck.");
    expect(out).toContain("Starting slide 1.");
  });

  it("strips trailing open od markup while streaming", () => {
    const input = "Working…\n<odTodoWrite>\n[{\"id\":\"1\"";
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("Working…");
    expect(text).not.toContain("<odTodoWrite");
  });

  it("removes fake tool narration placeholders", () => {
    const input = "Next step [正在调用 TodoWrite …] then build.";
    expect(stripInternalOpenDesignMarkup(input)).toBe("Next step  then build.");
  });

  it("sanitizeAssistantProseForDisplay applies closed + open stripping when streaming", () => {
    const input = "Hi\n<odThinking>secret chain</odThinking>\n<odTodoWrite>[";
    expect(sanitizeAssistantProseForDisplay(input, { streaming: true })).toBe("Hi");
  });

  it("strips closed redacted_thinking but PRESERVES closed system-reminder for chip render", () => {
    // `<system-reminder>` is a rendering element (AssistantMessage turns it
    // into the "Possible prompt injection" chip), NOT internal reasoning —
    // sanitize must keep the closed block so the chip renderer can pick it
    // up. Other reasoning tags like `redacted_thinking` still get stripped.
    const rt = "redacted_thinking";
    const input = [
      "Answer.",
      `<${rt}>chain of thought</${rt}>`,
      "<system-reminder>do not say this</system-reminder>",
      "Done.",
    ].join("\n");
    const out = stripInternalOpenDesignMarkup(input);
    expect(out).not.toContain("redacted_thinking");
    expect(out).not.toContain("chain of thought");
    expect(out).toContain("<system-reminder>do not say this</system-reminder>");
    expect(out).toContain("Answer.");
    expect(out).toContain("Done.");
  });

  it("strips trailing open redacted_thinking while streaming", () => {
    const rt = "redacted_thinking";
    const input = `Working…\n<${rt}>\nThe user wants`;
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("Working…");
  });

  it("strips closed info blocks and trailing open info while streaming", () => {
    const closed = [
      "Plan ready.",
      "<info>TodoWrite called with 9 tasks</info>",
      "<info>Marking task 1 as in_progress</info>",
      "슬라이드 구성 계획:",
    ].join("\n");
    expect(stripInternalOpenDesignMarkup(closed)).toBe("Plan ready.\n\n슬라이드 구성 계획:");

    const streaming = "Working…\n<info>Marking task 3 as in_progress";
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(streaming);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("Working…");
  });

  it("strips trailing open pseudo-tool tags while streaming", () => {
    const cases = [
      ["Working…\n<function_calls><invoke", "Working…"],
      ["Plan\n<todo-list><item>Step", "Plan"],
      ["Next\n<invoke name=\"Write\">", "Next"],
      ["Draft\n<tool_call>\n{\"name\": \"Write\"", "Draft"],
    ] as const;
    for (const [streaming, expected] of cases) {
      const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(streaming);
      expect(hadOpenInternalMarkup).toBe(true);
      expect(text).toBe(expected);
    }
  });

  it("strips Cursor-style tool_call blocks with JSON payloads", () => {
    const input = [
      "슬라이드 구성 계획:",
      "<tool_call>",
      '{"name": "TodoUpdate", "arguments": {"updates": [{"index": 1, "status": "completed"}]}}',
      "</tool_call>",
      "<tool_call>",
      '{"name": "Write", "arguments": {"path": "index.html", "content": "<!doctype html>"}}',
      "</tool_call>",
      "본문 시작",
    ].join("\n");
    const out = sanitizeLeakedAgentProse(input);
    expect(out).not.toContain("<tool_call>");
    expect(out).not.toContain("TodoUpdate");
    expect(out).not.toContain("<!doctype html>");
    expect(out).toContain("슬라이드 구성 계획:");
    expect(out).toContain("본문 시작");
  });

  it("sanitizeAssistantProseForDisplay strips unclosed tool_call in history too", () => {
    const input = "Visible intro\n<tool_call>\n{\"name\": \"Write\", \"arguments\":";
    expect(sanitizeAssistantProseForDisplay(input)).toBe("Visible intro");
  });

  it("strips pseudo-tool XML, thinking tags, fake file reads, and bare status lines", () => {
    const input = [
      "<function_calls><invoke name=\"Write\"><parameter name=\"path\">x.html</parameter></invoke></function_calls>",
      "<todo-list><item>Step 1</item></todo-list>",
      "[读取 template.html 中的布局]",
      "[Reading layouts.md for patterns]",
      "Marking task 2 as completed",
      "<thinking>internal plan</thinking>",
      "<info>Running tool: Bash</info>",
      "Deliverable ready.",
    ].join("\n");
    const out = sanitizeLeakedAgentProse(input);
    expect(out).toBe("Deliverable ready.");
  });

  it("keeps legitimate user-facing prose that mentions tools in natural language", () => {
    const input =
      "슬라이드 구성 계획:\n\n12장 구조\n\n커버 — 기업 AI 도입의 실질적 효과";
    expect(sanitizeLeakedAgentProse(input)).toBe(input);
  });

  it("optionally preserves closed <artifact> blocks for transcript summarization", () => {
    // `sanitizePriorAssistantTurnForTranscript` calls this after
    // `summarizeArtifactsForTranscript` has already handled confirmed-save
    // artifacts (summarized) and left unconfirmed ones intact. Stripping
    // closed `<artifact>` again here would silently discard those unconfirmed
    // bodies — the transcript would then reach the next turn with no source
    // to inspect or repair. The `preserveClosedArtifact` opt-in is what keeps
    // that contract intact.
    const input = [
      "Build summary below.",
      '<artifact identifier="deck" type="text/html" title="Pitch deck">',
      "<html><body>only surviving copy</body></html>",
      "</artifact>",
    ].join("\n");

    expect(stripInternalOpenDesignMarkup(input)).not.toContain("<artifact");
    expect(stripInternalOpenDesignMarkup(input, { preserveClosedArtifact: true })).toContain(
      "<artifact identifier=\"deck\"",
    );
    expect(stripInternalOpenDesignMarkup(input, { preserveClosedArtifact: true })).toContain(
      "only surviving copy",
    );
    expect(stripInternalOpenDesignMarkup(input, { preserveClosedArtifact: true })).toContain(
      "</artifact>",
    );
  });

  it("routes stripLeakedPseudoToolXml through the shared sanitizer", () => {
    const input = "<info>TodoWrite called with 3 tasks</info>\n\n본문";
    expect(stripLeakedPseudoToolXml(input)).toBe("본문");
  });

  it("web and daemon import the contracts SSOT for pseudo-tool stripping", async () => {
    const contracts = await import("@open-design/contracts");
    const daemonStrip = (await import("../../daemon/src/think-tag-splitter.js"))
      .stripLeakedPseudoToolXml;
    const sample =
      "<tool_call>{\"name\":\"Write\",\"arguments\":{}}</tool_call>\n\n본문";
    const expected = contracts.sanitizeAssistantProseForDisplay(sample, { streaming: true });
    expect(stripLeakedPseudoToolXml(sample)).toBe(expected);
    expect(daemonStrip(sample)).toBe(expected);
  });
});

describe("sanitizeChatMessageLeakedPseudoTool (expanded)", () => {
  it("strips od markup and info narration from persisted text events", () => {
    const message = {
      id: "m1",
      role: "assistant" as const,
      content: "<info>Marking task 1 as in_progress</info>",
      events: [
        { kind: "text" as const, text: "Plan\n<odTodoWrite>[{\"id\":\"1\"}]</odTodoWrite>" },
      ],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("");
    expect(sanitized.events?.[0]).toEqual({ kind: "text", text: "Plan" });
  });

  it("strips Daisy badge + mid-SVG CSS without </style> on persist write path", () => {
    const debris = [
      '<span style="background:',
      "#FDE68A;border:3px solid ",
      "#2D2D2D;border-radius:20px;padding:10px 28px;font-family:'Quicksand',sans-serif;box-shadow:4px 4px 0 ",
      '#2D2D2D">Internal Team</span>',
      "</div>",
      "<!-- Daisy motif TL -->none;stroke:",
      "#232323;stroke-width:2.0",
    ].join("\n");
    const sanitized = sanitizeChatMessageLeakedPseudoTool({
      id: "m2",
      role: "assistant",
      content: `슬라이드 초안을 준비했습니다.\n\n${debris}`,
      events: [{ kind: "text", text: `슬라이드 초안을 준비했습니다.\n\n${debris}` }],
    });
    expect(sanitized.content).toBe("슬라이드 초안을 준비했습니다.");
    expect(sanitized.events?.[0]).toMatchObject({
      kind: "text",
      text: "슬라이드 초안을 준비했습니다.",
    });
  });

  it("hard-strips unknown HTML tags via web display last-pass", () => {
    expect(
      sanitizeAssistantProseForDisplay(`초안. <a href="https://x.test">링크</a>`, {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(`<slide-counter>3 / 8</slide-counter>`, {
        stripCodeFences: true,
      }),
    ).toBe("");
    const withForm = sanitizeAssistantProseForDisplay(
      `질문\n<question-form id="discovery">{"questions":[{"id":"1"}]}</question-form>`,
      { stripCodeFences: true },
    );
    expect(withForm).toContain('<question-form id="discovery">');
    expect(withForm).toContain("질문");
  });

  it("hard-strips xml / split-tag / attr-tail leftovers via web display last-pass", () => {
    expect(
      sanitizeAssistantProseForDisplay(`<?xml version="1.0"?>\n<svg></svg>`, {
        stripCodeFences: true,
      }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\n<div\nclass="slide">본문</div>`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`초안. class="card pill"`, { stripCodeFences: true }),
    ).toBe("초안.");
  });

  it("hard-strips fullwidth tags / css-fn / event-attr leftovers via web display last-pass", () => {
    expect(
      sanitizeAssistantProseForDisplay(`진행.\n＜div class="slide"＞본문＜/div＞`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`초안.\ncalc(100% - 48px)`, { stripCodeFences: true }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(`초안. onclick="next()"`, { stripCodeFences: true }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nquerySelector('.slide')`, { stripCodeFences: true }),
    ).toBe("진행.");
  });

  it("hard-strips encoded tags / svg attr / css-fn leftovers via web display last-pass", () => {
    expect(
      sanitizeAssistantProseForDisplay(`진행.\n&#60;div class="slide"&#62;본문&#60;/div&#62;`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`초안. xmlns="http://www.w3.org/2000/svg"`, {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(`초안.\nlinear-gradient(90deg,#F5F0E6,#fff)`, {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nel.innerHTML = '<section class="slide">x</section>'`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });
});
