import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { resolveTeamverDriveAssetUrl } from "../designApiBase";
import {
  listTeamverProjectOutputs,
  type TeamverProjectOutputsResult,
} from "../listProjectOutputs";
import type { TeamverPublishDriveOutput } from "../publishToDrive";

type Props = {
  projectId: string;
  /**
   * Bumping this value forces a fresh fetch. The parent menu increments it
   * after every successful publish so the history reflects the new row
   * without a page refresh.
   */
  refreshKey: number;
  onError?: (err: unknown) => void;
};

const VISIBLE_ROW_LIMIT = 5;
const KIND_LABELS: Record<string, string> = {
  html: "HTML",
  zip: "ZIP",
  pdf: "PDF",
};

function formatRelativeTimestamp(iso: string | null | undefined): string {
  if (!iso) return "발행 시각 미상";
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "발행 시각 미상";

  const diffMs = Date.now() - target.getTime();
  const absSec = Math.abs(diffMs) / 1000;

  if (absSec < 45) return "방금 전";
  if (absSec < 90) return "1분 전";
  const absMin = absSec / 60;
  if (absMin < 45) return `${Math.round(absMin)}분 전`;
  if (absMin < 90) return "1시간 전";
  const absHour = absMin / 60;
  if (absHour < 24) return `${Math.round(absHour)}시간 전`;
  const absDay = absHour / 24;
  if (absDay < 2) return "어제";
  if (absDay < 7) return `${Math.round(absDay)}일 전`;

  // Falls back to a stable Asia/Seoul-friendly absolute string for older rows
  // so users can still compare versions across weeks.
  return target.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatFileSize(sizeBytes: number | null | undefined): string | null {
  if (!sizeBytes || sizeBytes <= 0) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind.toLowerCase()] ?? kind.toUpperCase();
}

function readyOutputs(outputs: TeamverPublishDriveOutput[]): TeamverPublishDriveOutput[] {
  // Only ready rows can carry a Drive deep link; failed rows would render a
  // broken "Drive 열기" link, which is worse than hiding them from history.
  return outputs.filter((output) => output.publishStatus === "ready" && output.driveAssetId.trim() !== "");
}

/**
 * loop 174 — Drive publish history surface.
 *
 * Why this exists: before loop 174 the FileViewer download menu only ever
 * showed a single "Publish to Teamver Drive" action. Operators reported they
 * couldn't tell whether they had ever published this artifact, when, or what
 * version was in Drive — they had to leave the embed, open Drive, scan a
 * folder and guess. Every publish row already lives in `design_outputs` and
 * is exposed by `GET /api/v1/projects/{id}/outputs` (sorted by
 * `published_at DESC`), so this component is purely a UI surface over data we
 * already persist.
 *
 * Version labels (`v1`, `v2`, ...) are assigned client-side from the
 * ready-only DESC index: the most recent publish is always `v{ready.length}`,
 * the oldest visible row is `v1`. Operators don't have to memorise a
 * timestamp to talk about "v3 vs v2".
 */
export function TeamverDrivePublishHistory({ projectId, refreshKey, onError }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TeamverProjectOutputsResult | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!projectId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const next = await listTeamverProjectOutputs(projectId);
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "outputs_fetch_failed");
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [onError, projectId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory, refreshKey]);

  const ready = readyOutputs(result?.outputs ?? []);
  const visible = ready.slice(0, VISIBLE_ROW_LIMIT);
  const remaining = Math.max(0, ready.length - visible.length);

  return (
    <div
      className="teamver-drive-history"
      role="group"
      aria-label="Teamver 드라이브 발행 이력"
      data-testid="teamver-drive-history"
    >
      <div className="teamver-drive-history__header">
        <span className="teamver-drive-history__title">Drive 발행 이력</span>
        <button
          type="button"
          className="teamver-drive-history__refresh"
          aria-label="발행 이력 새로고침"
          data-testid="teamver-drive-history-refresh"
          disabled={loading}
          onClick={() => void fetchHistory()}
        >
          <Icon name="refresh" size={13} />
        </button>
      </div>
      {loading && visible.length === 0 ? (
        <p
          className="teamver-drive-history__empty"
          data-testid="teamver-drive-history-loading"
        >
          이력을 불러오는 중…
        </p>
      ) : error ? (
        <p
          className="teamver-drive-history__empty teamver-drive-history__empty--error"
          role="status"
          aria-live="polite"
          data-testid="teamver-drive-history-error"
        >
          이력을 불러오지 못했습니다.
        </p>
      ) : visible.length === 0 ? (
        <p
          className="teamver-drive-history__empty"
          data-testid="teamver-drive-history-empty"
        >
          아직 Teamver 드라이브에 발행한 적이 없습니다.
        </p>
      ) : (
        <ul className="teamver-drive-history__list" role="list">
          {visible.map((output, index) => {
            // ready[] is `published_at DESC`. The first visible row is the
            // newest, so it should carry the highest version number among the
            // ready rows we know about.
            const version = ready.length - index;
            const driveUrl = output.driveAssetId
              ? resolveTeamverDriveAssetUrl(output.driveAssetId)
              : null;
            const sizeLabel = formatFileSize(output.sizeBytes);
            const tooltipParts = [
              output.filename,
              output.publishedAt ?? "",
            ].filter(Boolean) as string[];
            return (
              <li
                key={output.id || `${output.driveAssetId}-${index}`}
                className="teamver-drive-history__row"
                data-testid={`teamver-drive-history-row-${index}`}
              >
                <span
                  className="teamver-drive-history__version"
                  data-testid={`teamver-drive-history-version-${index}`}
                >
                  v{version}
                </span>
                <span className="teamver-drive-history__meta">
                  <span className="teamver-drive-history__time">
                    {formatRelativeTimestamp(output.publishedAt)}
                  </span>
                  <span className="teamver-drive-history__kind">{kindLabel(output.kind)}</span>
                  {sizeLabel ? (
                    <span className="teamver-drive-history__size">{sizeLabel}</span>
                  ) : null}
                </span>
                <span
                  className="teamver-drive-history__filename"
                  title={tooltipParts.join(" · ")}
                >
                  {output.filename || output.kind}
                </span>
                {driveUrl ? (
                  <a
                    className="teamver-drive-history__link"
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`teamver-drive-history-open-${index}`}
                  >
                    Drive 열기
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {remaining > 0 ? (
        <p
          className="teamver-drive-history__more"
          data-testid="teamver-drive-history-more"
        >
          이전 발행 {remaining}건은 Teamver 드라이브에서 확인할 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
