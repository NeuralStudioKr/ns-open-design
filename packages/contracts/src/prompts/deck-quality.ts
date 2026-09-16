/**
 * Shared slide-content quality contracts.
 *
 * The user's message is a TOPIC/BRIEF to research and explain — not caption
 * text to paste onto slides. Home / Canvas / Drive / Clone-fill all share this.
 */

export const SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION =
  "Content expansion contract (READ — brief is a topic, not slide text): " +
  "The user's message is a TOPIC/BRIEF to research and explain, NOT content to copy verbatim onto slides. " +
  "Use your domain knowledge of the topic to write real slide content — definitions, architecture, features, examples, code snippets, workflows, trade-offs, comparisons, and next steps as the subject matter demands. " +
  "Audience-depth binding: match wording, depth, and examples to the stated audience. Senior developer / 시니어 개발자 → architecture, internals, edge cases, real API/config names, code-level trade-offs (not a beginner intro). Junior / 신입 → onboarding basics, glossary, hands-on first steps. Executive / 경영진 → KPIs, ROI, decisions, risk framing. Client / 고객 → problem→solution→proof→next step. Education / 교육 → learning objectives, examples, practice. " +
  "Failed deliverables (do NOT ship): (a) slides whose title or body is the user's instruction (e.g. \"[topic]에 대해서 설명하는 피피티 만들어줘\", \"AI 도입 전략 만들어줘\"); (b) slides with only the topic word restated (\"소개\", \"특징\", the topic name alone) and no real content; (c) generic filler bullets (\"핵심 메시지 정리\", \"주요 특징\", \"기대 효과\") without concrete specifics; (d) placeholders (\"…\", \"내용을 작성하세요\", \"content here\"); (e) copy-pasting the topic word across every slide. " +
  "Required deck arc for a topic explainer (adapt to the actual brief; do not force this shape when the brief is a report/pitch/timeline): cover (real title + one-line value) → what it is (concrete definition + primary use case) → why it matters for the stated audience → how it works / architecture with named parts → key features/APIs with real names → real code snippet or workflow example when senior-dev / education audience → trade-offs and comparisons with named alternatives → real-world use cases or adoption signal → closing / next steps. " +
  "Fit that arc into the requested slide count — merge beats rather than adding slides. An 8–10 request must stay ≤10; 15 slides is a failed overshoot. " +
  "Each body slide must contain domain-specific nouns, product/API names, numbers, or comparisons that would ONLY make sense to someone who knows the topic. If you cannot name any, the topic was not researched enough — do NOT ship generic filler; write what a knowledgeable presenter would actually say.";

/**
 * Topic-neutral anti-parroting. Do NOT name an unrelated product here —
 * a concrete worked example in the user turn or system prompt becomes
 * slide copy when the actual brief is a different site/topic.
 */
export const SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE =
  "Worked example — if the brief is an instruction like \"[topic]에 대해서 설명하는 피피티 만들어줘\": " +
  "Cover title must be a real talk title about THAT topic (NEVER the instruction itself). " +
  "Expand into domain slides for the stated topic and audience — definition, named parts, evidence, trade-offs, next steps. " +
  "A deck that only restates the instruction or the topic word (\"소개\", \"특징\") is a failed deliverable. " +
  "Do not copy this example's wording, or any other host-contract example, onto slides.";

/**
 * Shared with JSON slot-fill, prompt-fill, and Canvas/Home/Drive HTML create.
 * Product entry (Canvas vs Home) must not weaken this contract.
 */
export const SLIDE_DECK_LAYOUT_VARIETY_INSTRUCTION =
  "Layout variety is REQUIRED (mirror the template preview): " +
  "the template ships multiple slide shells (cover, cards grid, stat/data, team, timeline, process, quote, closing). " +
  "When the deck has 4+ content slides, rotate through ≥ 4 distinct shells from the Template scaffold map — " +
  "never stamp the same list/body layout on every page while other shells sit unused.";

/**
 * Shared copy-density bar. Title-only cards / bare labels fail next to the
 * template preview (~2–3 sentences per card).
 */
export const SLIDE_DECK_COPY_DENSITY_INSTRUCTION =
  "Copy density mirrors the template preview: every non-cover, non-closing slide needs a full-sentence lead " +
  "(or opening <p>) and card/list entries with a concrete 1-sentence body (~12–28 Korean chars or 6–16 English words). " +
  "Bare labels (`핵심`, `개념`, `요약`), single-noun bullets, and title-only cards fail.";

/**
 * 루프544 — Prompt-fill / JSON slot-fill hard rules에서 강제하는 슬롯 단위 유일성.
 * 슬롯마다 서로 다른 1~2문장을 요구하고, 한 단어 라벨과 같은 문장의 복붙을 금지한다.
 * 실제 사용자 리포트: "글을 매력적으로 쓰는 팁" 덱에서 카드 body가 여러 슬라이드에
 * `개념/구조/영향`으로 동일하게 반복되고 있었다.
 */
export const SLIDE_DECK_UNIQUE_SLOT_COPY_INSTRUCTION =
  "Unique-per-slot copy is REQUIRED: each card / list item / stat / step / quote body must be a DIFFERENT concrete 1–2 sentence line. " +
  "Do not repeat the slide title as its body. Do not stamp the same lead/body across multiple slides — if two slides would end up with identical body strings, rewrite one with a distinct angle. " +
  "Bare one-word labels (핵심, 개념, 요약, 특징, 목표, 방향) as body copy are forbidden — expand to a real sentence about THIS slide's angle. " +
  "A deck where a majority of body slides share the same body sentence is a failed deliverable.";

/**
 * 루프544 — Topic-lock: brief 주제 밖 일반론(`개념/구조/영향`, `용어와 원리를 짧고
 * 정확하게 정의`, `배경/핵심 질문/판단 기준`) 을 그대로 카드에 붙이면 어떤 주제든
 * 같은 덱처럼 보인다. deterministic synth outline이 넣어도 되는 skeleton과 달리,
 * 모델이 채우는 prompt-fill/JSON slot-fill 턴에서는 주제 명사·근거 없는 일반론을
 * 카드로 남기지 말라고 못 박는다. 카탈로그 영어 데모 잔재도 같이 금지.
 */
export const SLIDE_DECK_TOPIC_LOCK_INSTRUCTION =
  "Topic-lock (brief-tethered content): every card/list/stat body must reference the actual brief topic with concrete nouns, examples, or judgement criteria for THAT topic. " +
  "Generic outline scaffolds parroted verbatim — `개념 / 구조 / 영향`, `용어와 원리를 짧고 정확하게 정의`, `구성 요소와 서로 연결되는 방식을 설명`, `배경 / 핵심 질문 / 판단 기준`, `Definition / Structure / Impact` — are forbidden as final slide copy. Use them as your INTERNAL outline only; the shipped card body must swap in the brief's nouns and specifics. " +
  "Do not invent quantitative KPIs, prices ($XB, ₩억, %), or market-share claims unless the brief or attached source materials state them. Prefer qualitative topic-specific claims over fabricated numbers. " +
  "Do not leave English catalog demo copy from the template example (Presentation Template, THANK YOU FOR WATCHING, NEXUS VENTURES, Q1 2026 · $1.2M, Studio Orbital, Access Tiers pricing, AGENDA.TXT, All systems operational, Connecting Founders With Opportunity, Hartfield, NorthPeak, WACC, EBITDA, Project Atlas) in a Korean deck.";
