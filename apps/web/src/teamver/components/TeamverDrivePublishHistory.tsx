import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { resolveTeamverDriveAssetUrl } from "../designApiBase";
import { TEAMVER_DRIVE_ASSET_LINK_LABEL } from "../teamverDriveDeepLink";
import {
  listTeamverProjectOutputs,
  type TeamverProjectOutputsResult,
} from "../listProjectOutputs";
import type { TeamverPublishDriveOutput } from "../publishToDrive";
import {
  handleTeamverDriveAuthFailure,
  redirectToTeamverLoginFromEmbed,
  TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE,
} from "../teamverBffAuthError";
import { formatTeamverDrivePanelReloginMessage } from "../teamverDriveAuthCopy";

type Props = {
  projectId: string;
  /**
   * Bumping this value forces a fresh fetch. The parent menu increments it
   * after every successful publish so the history reflects the new row
   * without a page refresh.
   */
  refreshKey: number;
  /** When true, only the latest row is shown until expanded. */
  defaultCollapsed?: boolean;
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
  return outputs.filter((output) => output.publishStatus === "ready" && output.driveAssetId.trim() !== "");
}

/**
 * loop 174 — Drive publish history surface.
 * Collapsed deferral: skip `/outputs` until expand / publish refresh / manual refresh
 * so opening the publish panel does not always hit design-api.
 */
export function TeamverDrivePublishHistory({
  projectId,
  refreshKey,
  defaultCollapsed = false,
  onError,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [result, setResult] = useState<TeamverProjectOutputsResult | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hasRequested, setHasRequested] = useState(!defaultCollapsed);
  const [manualRefreshNonce, setManualRefreshNonce] = useState(0);
  const fetchSeqRef = useRef(0);
  const hasRowsRef = useRef(false);

  const fetchHistory = useCallback(async () => {
    if (!projectId.trim()) return;
    const seq = ++fetchSeqRef.current;
    if (!hasRowsRef.current) setLoading(true);
    setError(null);
    setAuthRequired(false);
    try {
      const next = await listTeamverProjectOutputs(projectId);
      if (seq !== fetchSeqRef.current) return;
      // Soft null = BFF/workspace not ready — do not treat as an empty history.
      if (!next) {
        setResult(null);
        hasRowsRef.current = false;
        setError("outputs_unavailable");
        onError?.(new Error("outputs_unavailable"));
        return;
      }
      setResult(next);
      hasRowsRef.current = readyOutputs(next.outputs ?? []).length > 0;
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      if (
        handleTeamverDriveAuthFailure(err, {
          onRelogin: () => {
            setAuthRequired(true);
          },
          onTransient: () => {
            setAuthRequired(false);
            setError(TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE);
          },
        })
      ) {
        // handled
      } else {
        setError(err instanceof Error ? err.message : "outputs_fetch_failed");
      }
      onError?.(err);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [onError, projectId]);

  useEffect(() => {
    // Defer until expand / publish refreshKey / explicit refresh — not on collapse-only.
    if (defaultCollapsed && !hasRequested && refreshKey === 0 && manualRefreshNonce === 0) {
      return;
    }
    void fetchHistory();
  }, [defaultCollapsed, fetchHistory, hasRequested, manualRefreshNonce, refreshKey]);

  const ready = readyOutputs(result?.outputs ?? []);
  const visibleLimit = collapsed ? 1 : VISIBLE_ROW_LIMIT;
  const visible = ready.slice(0, visibleLimit);
  const remaining = Math.max(0, ready.length - visible.length);
  const canToggle =
    ready.length > 1
    || (collapsed && ready.length > 0)
    || (defaultCollapsed && !hasRequested);
  const showDeferredHint = defaultCollapsed && collapsed && !hasRequested && !loading;

  return (
    <div
      className={`teamver-drive-history${collapsed ? " teamver-drive-history--truncated" : ""}`}
      role="group"
      aria-label="Teamver 드라이브 발행 이력"
      data-testid="teamver-drive-history"
    >
      <div className="teamver-drive-history__header">
        <span className="teamver-drive-history__title">Drive 발행 이력</span>
        {canToggle ? (
          <button
            type="button"
            className="teamver-drive-history__toggle"
            data-testid="teamver-drive-history-toggle"
            onClick={() => {
              const expanding = collapsed;
              setCollapsed((current) => !current);
              if (expanding) setHasRequested(true);
            }}
          >
            {collapsed ? "펼치기" : "접기"}
          </button>
        ) : null}
        <button
          type="button"
          className="teamver-drive-history__refresh"
          aria-label="발행 이력 새로고침"
          data-testid="teamver-drive-history-refresh"
          disabled={loading}
          onClick={() => {
            setHasRequested(true);
            setManualRefreshNonce((nonce) => nonce + 1);
          }}
        >
          <Icon name="refresh" size={13} />
        </button>
      </div>
      {showDeferredHint ? (
        <p
          className="teamver-drive-history__empty"
          data-testid="teamver-drive-history-deferred"
        >
          펼쳐서 이전 발행을 확인하세요.
        </p>
      ) : loading && visible.length === 0 ? (
        <p
          className="teamver-drive-history__empty"
          data-testid="teamver-drive-history-loading"
        >
          이력을 불러오는 중…
        </p>
      ) : authRequired ? (
        <p
          className="teamver-drive-history__empty teamver-drive-history__empty--error"
          role="status"
          aria-live="polite"
          data-testid="teamver-drive-history-auth-required"
        >
          {formatTeamverDrivePanelReloginMessage()}{" "}
          <button
            type="button"
            className="teamver-drive-history__login"
            data-testid="teamver-drive-history-login"
            onClick={redirectToTeamverLoginFromEmbed}
          >
            다시 로그인
          </button>
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
                    aria-label={TEAMVER_DRIVE_ASSET_LINK_LABEL}
                    data-testid={`teamver-drive-history-open-${index}`}
                  >
                    {TEAMVER_DRIVE_ASSET_LINK_LABEL}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {remaining > 0 && !collapsed && !error && !authRequired ? (
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
