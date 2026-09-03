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
