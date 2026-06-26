import type { FormOption, FormQuestion, QuestionForm } from '../../artifacts/question-form';
import { isTeamverEmbedMode } from '../designApiBase';
import type { TeamverBrandingConfig } from './config';

/** Question ids that route artifact kind — hidden in embed slide-only MVP. */
const ROUTING_QUESTION_IDS = new Set([
  'output',
  'taskType',
  'task-type',
  'task_type',
  'artifactKind',
  'artifact_kind',
  'taskKind',
  'task_kind',
  'surface',
  'build',
  'deliverable',
  'deliverableType',
  'deliverable_type',
]);

/**
 * User-facing labels that ask which artifact to produce. Models localize these
 * (e.g. task-type form uses "What should I build?" → "무엇을 만들까요?") while
 * keeping arbitrary question ids — match labels, not ids only.
 */
const ROUTING_QUESTION_LABEL_HINT =
  /무엇을\s*만들|어떤\s*형태(?:로)?\s*만들|what\s+(?:are\s+we|should\s+(?:i|we))\s+(?:make|build)|what\s+(?:to|are\s+you)\s+(?:make|build)|choose\s+(?:the\s+)?task|task\s+type|작업\s*유형|만들\s*(?:것|까요)|deliverable|artifact\s*kind|what\s+kind\s+of/i;

/** Entire forms that must not render in slide-only embed. */
function isBannedSlideOnlyFormId(formId: string): boolean {
  const id = formId.trim().toLowerCase();
  if (id === 'direction-cards') return true;
  return id.startsWith('media-');
}

/** Deck-friendly platform option labels (English + common localized variants). */
const DECK_PLATFORM_HINT =
  /fixed canvas|16\s*:\s*9|4\s*:\s*3|1920|1440|web viewer|슬라이드|캔버스|16:9|4:3/i;

/** App / prototype platform labels that must not appear in slide-only embed. */
const NON_DECK_PLATFORM_HINT =
  /\bios\b|\bandroid\b|tablet|desktop app|desktop web|responsive web(?!\s*viewer)|iphone|ipad|모바일 앱|태블릿|데스크톱 앱|반응형 웹/i;

/** Non-deck artifact labels inside routing radio/select questions. */
const NON_DECK_ARTIFACT_OPTION_HINT =
  /prototype|landing|dashboard|editorial|marketing|hyperframes|live artifact|\bvideo\b|\baudio\b|\bimage\b|웹 프로토타입|랜딩|대시보드|에디토리얼|마케팅|멀티스크린|multi-screen/i;

const SLIDE_ARTIFACT_OPTION_HINT = /slide deck|pitch|슬라이드|\bdeck\b|발표자료/i;

function optionLabel(option: string | FormOption): string {
  return typeof option === 'string' ? option : option.label;
}

function isDeckPlatformOption(option: string | FormOption): boolean {
  const label = optionLabel(option);
  if (DECK_PLATFORM_HINT.test(label)) return true;
  if (NON_DECK_PLATFORM_HINT.test(label)) return false;
  return false;
}

function isPlatformQuestion(question: FormQuestion): boolean {
  if (question.id === 'platform') return true;
  return /platform|플랫폼|대상\s*플랫폼|target platform/i.test(question.label);
}

function isRoutingArtifactQuestion(question: FormQuestion): boolean {
  if (ROUTING_QUESTION_IDS.has(question.id)) return true;

  const isChoiceQuestion =
    question.type === 'radio' || question.type === 'select' || question.type === 'checkbox';
  if (!isChoiceQuestion) return false;

  // Localized "What should I build?" / "무엇을 만들까요?" — always hide in slide-only.
  if (ROUTING_QUESTION_LABEL_HINT.test(question.label)) return true;

  if (question.type === 'checkbox' && isPlatformQuestion(question)) return false;

  const options = question.options ?? [];
  if (options.length < 2) return false;
  let nonDeck = 0;
  let deckLike = 0;
  for (const option of options) {
    const label = optionLabel(option);
    if (SLIDE_ARTIFACT_OPTION_HINT.test(label)) {
      deckLike += 1;
      continue;
    }
    if (NON_DECK_ARTIFACT_OPTION_HINT.test(label)) nonDeck += 1;
  }
  return nonDeck >= 2 && nonDeck > deckLike;
}

function filterPlatformQuestion(question: FormQuestion): FormQuestion | null {
  const rawOptions = question.options ?? [];
  const options = rawOptions.filter(isDeckPlatformOption);
  if (options.length === 0) return null;
  return {
    ...question,
    options,
    maxSelections: Math.min(question.maxSelections ?? 4, options.length),
  };
}

function sanitizeQuestion(question: FormQuestion): FormQuestion | null {
  if (isRoutingArtifactQuestion(question)) return null;
  if (question.type === 'direction-cards') return null;
  if (isPlatformQuestion(question)) {
    return filterPlatformQuestion(question);
  }
  return question;
}

function shouldApplySlideOnlyQuestionFormGate(
  branding: Pick<TeamverBrandingConfig, 'slideOnlyMvp' | 'enabled'>,
): boolean {
  // Embed builds are deck-only even if a branding flag regresses.
  return branding.slideOnlyMvp || branding.enabled || isTeamverEmbedMode();
}

/**
 * Strip non-deck discovery / task-type options before render.
 * Daemon prompt (`TEAMVER_SLIDE_ONLY_SCOPE`) asks the model not to emit them,
 * but models drift — this is the FE half of doc 13 §2.5b Q-1~Q-4.
 */
export function sanitizeQuestionFormForSlideOnlyEmbed(
  form: QuestionForm | null | undefined,
): QuestionForm | null {
  if (!form) return null;
  if (isBannedSlideOnlyFormId(form.id)) return null;

  const questions = form.questions
    .map(sanitizeQuestion)
    .filter((q): q is FormQuestion => q !== null);

  if (questions.length === 0) return null;
  return { ...form, questions };
}

export function questionFormForSlideOnlyDisplay(
  form: QuestionForm | null | undefined,
  branding: Pick<TeamverBrandingConfig, 'slideOnlyMvp' | 'enabled'>,
): QuestionForm | null {
  if (!form) return null;
  if (!shouldApplySlideOnlyQuestionFormGate(branding)) return form;
  return sanitizeQuestionFormForSlideOnlyEmbed(form);
}
