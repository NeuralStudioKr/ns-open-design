import { splitDriveDisplayFileName } from "../driveFileVisual";

type Props = {
  name: string;
  className?: string;
  title?: string;
};

/**
 * Truncates the basename while keeping the file extension visible — matches
 * Teamver main FE drive picker / attachment chip ergonomics.
 */
export function TeamverDriveDisplayFileName({ name, className, title }: Props) {
  const parts = splitDriveDisplayFileName(name);
  const tip = title ?? parts.full;

  if (!parts.extension) {
    return (
      <span className={className ?? "teamver-drive-display-filename"} title={tip}>
        <span className="teamver-drive-display-filename-stem">{parts.stem}</span>
      </span>
    );
  }

  return (
    <span className={className ?? "teamver-drive-display-filename"} title={tip}>
      <span className="teamver-drive-display-filename-stem">{parts.stem}</span>
      <span className="teamver-drive-display-filename-ext">{parts.extension}</span>
    </span>
  );
}
