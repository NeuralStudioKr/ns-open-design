// Visual slide-template picker for the Canvas / Drive → Design "one-confirm"
// launch flow. Replaces the previous name-only `<select>` inside
// `TeamverCanvasSlideLaunchModal` with a grid of live example.html /
// pre-baked hover-pan clip tiles, matching the home hero + composer template
// galleries so users can actually SEE the template style before picking.
//
// Design intent (see docs-teamver: "Canvas → 슬라이드 template picker
// 시각화"):
//   - `role="radiogroup"` + `role="radio"` cards → arrow keys move focus and
//     change the selection, Enter/Space commits; the outer modal's Confirm
//     CTA still triggers the run so the modal keeps its atomic commit.
//   - Optional search bar filters by title / tags — necessary once template
//     count crosses ~15, but hidden when the list is trivially small.
//   - Falls back to a solid brand tile for the always-present "기본 슬라이드
//     템플릿" option (no `record`, so no PreviewSurface possible).
//
// The picker is intentionally used by BOTH the Canvas slide launch modal AND
// (future) any other "pick a deck skin" surface — do not couple it to the
// modal chrome. All wiring goes through `TeamverCanvasSlideTemplateOption`.

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { Icon } from "../../components/Icon";
import { inferPluginPreview } from "../../components/plugins-home/preview";
import { PreviewSurface } from "../../components/plugins-home/cards/PreviewSurface";
import { localizePluginDescription } from "../../components/plugins-home/localization";
import { CANVAS_CREATE_SLIDES_PLUGIN_ID, type TeamverCanvasSlideTemplateOption } from "../canvasSlideLaunch";
import { shouldEagerLoadCommunityPluginPreviews } from "../embedDaemonFetchPolicy";

type Props = {
  options: TeamverCanvasSlideTemplateOption[];
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
  /** Disable interaction while the parent is confirming the launch. */
  disabled?: boolean;
  /** Show the "search / filter" input above the grid. Auto ≥ 8 items. */
  showSearch?: boolean;
  /** Optional heading + hint copy overrides. */
  label?: string;
  hint?: string | null;
};

// Below this count the grid header (search + count) adds more noise than
// value, so we hide it to keep the modal chrome light.
const AUTO_SHOW_SEARCH_THRESHOLD = 8;

// Minimal `CSS.escape` polyfill sufficient for template ids (kebab-case /
// dotted plugin ids). Only used to build attribute selectors; jsdom test
// runs do not ship `window.CSS`, so we must never touch a missing global.
function safeEscapeCssIdent(value: string): string {
  const g = globalThis as { CSS?: { escape?: (s: string) => string } };
  if (typeof g.CSS?.escape === "function") return g.CSS.escape(value);
  // Escape characters that carry meaning inside `[attr="…"]` selectors.
  return value.replace(/["\\]/g, (ch) => `\\${ch}`);
}

export function CanvasSlideTemplatePicker({
  options,
  selectedTemplateId,
  onSelect,
  disabled = false,
  showSearch,
  label = "슬라이드 템플릿",
  hint = null,
}: Props) {
  const groupId = useId();
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const showSearchBar =
    (showSearch ?? options.length >= AUTO_SHOW_SEARCH_THRESHOLD) && options.length > 1;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => {
      if (option.id.toLowerCase().includes(q)) return true;
      if (option.title.toLowerCase().includes(q)) return true;
      const tags = option.record?.manifest?.tags ?? [];
      return tags.some((tag) => tag.toLowerCase().includes(q));
    });
  }, [options, query]);

  const selectedIndex = useMemo(() => {
    const idx = filtered.findIndex((option) => option.id === selectedTemplateId);
    return idx >= 0 ? idx : 0;
  }, [filtered, selectedTemplateId]);

  // Keep the DOM focus in sync with the selected card so screen readers +
  // sighted keyboard users see the same "which one is active" signal.
  // NB: `CSS.escape` is missing under jsdom, and template ids may contain
  // characters (`.`, `/`) that break the attribute selector; guard both.
  //
  // The grid can overflow (max-height + overflow-y: auto), so we also
  // ensure the focused card is inside the visible strip. `focus()` alone
  // is enough on most browsers, but `scrollIntoView({block: 'nearest'})`
  // avoids the "focus jumped, no visible change" trap when arrow-key
  // navigation crosses the grid edge.
  const focusCard = useCallback((templateId: string) => {
    const escaped = safeEscapeCssIdent(templateId);
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-template-id="${escaped}"]`,
    );
    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      const next = filtered[(selectedIndex + delta + filtered.length) % filtered.length];
      if (!next) return;
      onSelect(next.id);
      // Focus after the parent re-renders with the new selection.
      queueMicrotask(() => focusCard(next.id));
    },
    [filtered, focusCard, onSelect, selectedIndex],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (disabled || filtered.length === 0) return;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown": {
          event.preventDefault();
          moveSelection(1);
          break;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          event.preventDefault();
          moveSelection(-1);
          break;
        }
        case "Home": {
          event.preventDefault();
          const first = filtered[0];
          if (first) {
            onSelect(first.id);
            queueMicrotask(() => focusCard(first.id));
          }
          break;
        }
        case "End": {
          event.preventDefault();
          const last = filtered[filtered.length - 1];
          if (last) {
            onSelect(last.id);
            queueMicrotask(() => focusCard(last.id));
          }
          break;
        }
        default:
          break;
      }
    },
    [disabled, filtered, focusCard, moveSelection, onSelect],
  );

  // If the current selection is filtered out (e.g. by a search query) auto
  // fall back to the first visible option so the CTA reflects reality.
  useEffect(() => {
    if (filtered.length === 0) return;
    if (!filtered.some((option) => option.id === selectedTemplateId)) {
      onSelect(filtered[0]!.id);
    }
  }, [filtered, onSelect, selectedTemplateId]);

  if (options.length === 0) return null;

  if (options.length === 1) {
    // No selection to make — mirror the previous "static label" path.
    return (
      <div
        className="teamver-canvas-slide-launch-template teamver-canvas-slide-launch-template--static"
        data-testid="teamver-canvas-slide-launch-template"
      >
        <span className="teamver-canvas-slide-launch-template-label">{label}</span>
        <span className="teamver-canvas-slide-launch-template-static">{options[0]!.title}</span>
      </div>
    );
  }

  return (
    <div className="teamver-canvas-slide-launch-template teamver-canvas-slide-launch-template--picker">
      <div className="teamver-canvas-slide-launch-template-head">
        <span className="teamver-canvas-slide-launch-template-label" id={`${groupId}-label`}>
          {label}
        </span>
        {showSearchBar ? (
          <label className="teamver-canvas-slide-launch-template-search">
            <Icon name="search" size={12} aria-hidden />
            <input
              type="search"
              placeholder="템플릿 검색"
              value={query}
              disabled={disabled}
              onChange={(event) => setQuery(event.currentTarget.value)}
              data-testid="teamver-canvas-slide-launch-template-search"
              aria-label="Search slide templates"
            />
          </label>
        ) : (
          <span className="teamver-canvas-slide-launch-template-count">
            {options.length}
          </span>
        )}
      </div>
      {hint ? (
        <p className="teamver-canvas-slide-launch-template-hint">{hint}</p>
      ) : null}
      {/* Live region so screen reader users hear when a search filters the
          grid to N cards. Kept polite (not assertive) — this is
          informational, not urgent. */}
      <span
        className="teamver-canvas-slide-launch-template-live"
        aria-live="polite"
        data-testid="teamver-canvas-slide-launch-template-live"
      >
        {query.trim()
          ? filtered.length === 0
            ? "검색 결과 없음"
            : `템플릿 ${filtered.length}개 표시`
          : ""}
      </span>
      <div
        ref={containerRef}
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        className="teamver-canvas-slide-launch-template-grid"
        data-testid="teamver-canvas-slide-launch-template"
        onKeyDown={handleKeyDown}
      >
        {filtered.length === 0 ? (
          <div
            className="teamver-canvas-slide-launch-template-empty"
            data-testid="teamver-canvas-slide-launch-template-empty"
          >
            <p>검색어와 일치하는 템플릿이 없습니다.</p>
            <button
              type="button"
              className="teamver-canvas-slide-launch-template-empty-clear"
              data-testid="teamver-canvas-slide-launch-template-empty-clear"
              onClick={() => setQuery("")}
            >
              검색어 지우기
            </button>
          </div>
        ) : (
          filtered.map((option) => {
            const selected = option.id === selectedTemplateId;
            return (
              <CanvasSlideTemplateCard
                key={option.id}
                option={option}
                selected={selected}
                disabled={disabled}
                onSelect={() => {
                  if (disabled) return;
                  onSelect(option.id);
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

type CardProps = {
  option: TeamverCanvasSlideTemplateOption;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
};

// Tags that carry no visual signal for the user (packaging noise) — the same
// suppression list the home community gallery uses. Keeping the set local so
// this component stays self-contained; if the gallery adds more tokens we
// can promote to a shared constant later.
const CANVAS_TEMPLATE_CARD_NOISE_TAGS = new Set<string>([
  "first-party",
  "third-party",
  "phase-1",
  "phase-7",
  "untitled",
  "plugin",
  "deck",
  "slides",
  "presentation",
]);
const CANVAS_TEMPLATE_CARD_MAX_TAGS = 3;

function extractCardTags(option: TeamverCanvasSlideTemplateOption): string[] {
  const raw = option.record?.manifest?.tags ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of raw) {
    const value = tag.trim();
    if (!value) continue;
    if (CANVAS_TEMPLATE_CARD_NOISE_TAGS.has(value.toLowerCase())) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= CANVAS_TEMPLATE_CARD_MAX_TAGS) break;
  }
  return out;
}

function CanvasSlideTemplateCard({ option, selected, disabled, onSelect }: CardProps) {
  const record = option.record ?? null;
  const { locale } = useI18n();
  // Baked hover-pan clip when available (Home gallery convention); otherwise
  // fall back to the real example.html iframe or a text tile via
  // `PreviewSurface`.
  const preview = useMemo(
    () => (record ? inferPluginPreview(record, { preferBaked: true }) : null),
    [record],
  );
  const eager = shouldEagerLoadCommunityPluginPreviews();
  const description = record ? localizePluginDescription(locale, record).trim() : "";
  const tags = useMemo(() => extractCardTags(option), [option]);
  const isDefault = option.id === CANVAS_CREATE_SLIDES_PLUGIN_ID;
  const hasOverlay = Boolean(description) || tags.length > 0;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      data-template-id={option.id}
      data-selected={selected ? "true" : "false"}
      data-testid={`teamver-canvas-slide-launch-template-card-${option.id}`}
      className={[
        "teamver-canvas-slide-launch-template-card",
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
      onKeyDown={(event) => {
        // The grid `onKeyDown` already handles Arrow/Home/End; here we only
        // commit on Space/Enter so the card behaves like a real radio.
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="teamver-canvas-slide-launch-template-card-frame">
        {preview ? (
          // Explicitly opt OUT of `instantMount`: even inside a scrollable
          // modal grid, PreviewSurface's IntersectionObserver (rootMargin
          // 240px in eager mode, 120px otherwise) still fires early enough
          // that on-screen cards mount first paint, and cards scrolled far
          // out of view stay dormant. With 20+ community deck templates
          // this keeps first paint from spinning up 20 daemon iframe fetches.
          <PreviewSurface
            pluginId={option.id}
            pluginTitle={option.title}
            preview={preview}
            eager={eager}
          />
        ) : (
          <span
            className="teamver-canvas-slide-launch-template-card-default"
            aria-hidden
          >
            <Icon name="layers-filled" size={22} />
          </span>
        )}
        {isDefault ? (
          <span
            className="teamver-canvas-slide-launch-template-card-badge"
            data-testid={`teamver-canvas-slide-launch-template-card-default-badge-${option.id}`}
          >
            기본
          </span>
        ) : null}
        {selected ? (
          <span
            className="teamver-canvas-slide-launch-template-card-check"
            aria-hidden
          >
            <Icon name="check" size={12} />
          </span>
        ) : null}
        {hasOverlay ? (
          <span
            className="teamver-canvas-slide-launch-template-card-overlay"
            aria-hidden
            data-testid={`teamver-canvas-slide-launch-template-card-overlay-${option.id}`}
          >
            {description ? (
              <span className="teamver-canvas-slide-launch-template-card-desc">
                {description}
              </span>
            ) : null}
            {tags.length > 0 ? (
              <span className="teamver-canvas-slide-launch-template-card-tags">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="teamver-canvas-slide-launch-template-card-tag"
                  >
                    {tag}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="teamver-canvas-slide-launch-template-card-title" title={option.title}>
        {option.title}
      </span>
    </button>
  );
}
