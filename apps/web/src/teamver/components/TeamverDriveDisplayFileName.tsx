import { splitDriveDisplayFileName } from "../driveFileVisual";

type Props = {
  name: string;
  className?: string;
  title?: string;
};

function joinClassNames(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Truncates the basename while keeping the file extension visible — matches
 * Teamver main FE drive picker / attachment chip ergonomics.
 */
export function TeamverDriveDisplayFileName({ name, className, title }: Props) {
  const parts = splitDriveDisplayFileName(name);
  const tip = title ?? parts.full;
  // Always keep the base class so stem ellipsis CSS applies even when callers
  // pass a context className (e.g. import grid cards).
  const rootClass = joinClassNames("teamver-drive-display-filename", className);

  if (!parts.extension) {
    return (
      <span className={rootClass} title={tip}>
        <span className="teamver-drive-display-filename-stem">{parts.stem}</span>
      </span>
    );
  }

  return (
    <span className={rootClass} title={tip}>
      <span className="teamver-drive-display-filename-stem">{parts.stem}</span>
      <span className="teamver-drive-display-filename-ext">{parts.extension}</span>
    </span>
  );
}
