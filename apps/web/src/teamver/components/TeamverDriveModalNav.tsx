import { Icon } from "../../components/Icon";

export type TeamverDriveNavCrumb = {
  folderId: string | null;
  name: string;
};

type Props = {
  crumbs: TeamverDriveNavCrumb[];
  disabled?: boolean;
  onNavigate: (index: number) => void;
  onBack?: () => void;
};

/** Shared drive modal path chrome: optional back + breadcrumb. */
export function TeamverDriveModalNav({
  crumbs,
  disabled = false,
  onNavigate,
  onBack,
}: Props) {
  if (crumbs.length === 0) return null;
  const canGoBack = crumbs.length > 1 && typeof onBack === "function";

  return (
    <div className="teamver-drive-modal-nav" data-testid="teamver-drive-modal-nav">
      {canGoBack ? (
        <button
          type="button"
          className="teamver-drive-modal-back"
          aria-label="상위 폴더로"
          disabled={disabled}
          data-testid="teamver-drive-modal-back"
          onClick={onBack}
        >
          <Icon name="chevron-left" size={16} />
        </button>
      ) : null}
      <nav className="teamver-drive-import-crumb" aria-label="드라이브 폴더 경로">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <span key={`${crumb.folderId ?? "root"}:${index}`} className="teamver-drive-import-crumb-item">
              {index > 0 ? <span className="teamver-drive-import-crumb-sep">/</span> : null}
              {isLast ? (
                <span className="teamver-drive-import-crumb-current">{crumb.name}</span>
              ) : (
                <button
                  type="button"
                  className="teamver-drive-import-crumb-btn"
                  disabled={disabled}
                  onClick={() => onNavigate(index)}
                >
                  {crumb.name}
                </button>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

export function TeamverDriveListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="teamver-drive-skeleton" aria-hidden data-testid="teamver-drive-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="teamver-drive-skeleton-row">
          <span className="teamver-drive-skeleton-icon" />
          <span className="teamver-drive-skeleton-lines">
            <span className="teamver-drive-skeleton-line" />
            <span className="teamver-drive-skeleton-line teamver-drive-skeleton-line--sm" />
          </span>
        </div>
      ))}
    </div>
  );
}
