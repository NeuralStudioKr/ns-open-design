import { Icon } from "../../components/Icon";
import type { TeamverDriveImportScope } from "../driveImportList";

type Props = {
  scopes: TeamverDriveImportScope[];
  activeIndex: number;
  disabled?: boolean;
  onSelect: (index: number) => void;
};

function scopeKey(scope: TeamverDriveImportScope): string {
  return scope.mode === "personal" ? "personal" : `shared:${scope.sharedDriveId}`;
}

/**
 * Left rail replacing the horizontal pill tabs on Drive Import/Picker modals.
 *
 * Groups scopes into "내 드라이브" (personal) and "팀 드라이브" (shared), giving
 * team drives a users icon + section header so users see membership context at
 * a glance. Vertical scroll keeps N teams tractable where pills previously
 * hijacked the whole modal header with a horizontal scrollbar.
 */
export function TeamverDriveScopeSidebar({
  scopes,
  activeIndex,
  disabled = false,
  onSelect,
}: Props) {
  const personal = scopes
    .map((scope, index) => ({ scope, index }))
    .filter(({ scope }) => scope.mode === "personal");
  const shared = scopes
    .map((scope, index) => ({ scope, index }))
    .filter(({ scope }) => scope.mode === "shared");

  const renderItem = (scope: TeamverDriveImportScope, index: number) => {
    const active = index === activeIndex;
    const isTeam = scope.mode === "shared";
    return (
      <button
        key={scopeKey(scope)}
        type="button"
        role="tab"
        aria-selected={active}
        className={`teamver-drive-scope-item${active ? " is-active" : ""}`}
        data-testid={`teamver-drive-scope-item-${scopeKey(scope)}`}
        disabled={disabled}
        onClick={() => onSelect(index)}
      >
        <span className="teamver-drive-scope-icon" aria-hidden>
          <Icon name={isTeam ? "users" : "user"} size={14} />
        </span>
        <span className="teamver-drive-scope-name" title={scope.label}>
          {scope.label}
        </span>
        {isTeam ? (
          <span className="teamver-drive-scope-badge" aria-hidden>
            팀
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside
      className="teamver-drive-scope-sidebar"
      role="tablist"
      aria-label="드라이브 목록"
      data-testid="teamver-drive-scope-sidebar"
    >
      {personal.length > 0 ? (
        <div className="teamver-drive-scope-group">
          <div className="teamver-drive-scope-group-label">내 드라이브</div>
          {personal.map(({ scope, index }) => renderItem(scope, index))}
        </div>
      ) : null}
      {shared.length > 0 ? (
        <div className="teamver-drive-scope-group">
          <div className="teamver-drive-scope-group-label">팀 드라이브</div>
          {shared.map(({ scope, index }) => renderItem(scope, index))}
        </div>
      ) : null}
    </aside>
  );
}
