import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { driveImportAssetIconName } from "../driveFileVisual";

type Props = {
  name: string;
  mimeType?: string;
  previewUrl?: string | null;
  /** Extra class on the visual root (defaults to home-slide-create chip visual). */
  className?: string;
  iconClassName?: string;
  thumbClassName?: string;
  iconSize?: number;
  testId?: string;
};

/**
 * Shared attach/selected-chip preview: image thumb when available, else type icon.
 * Falls back to the type icon if the thumb fails to load.
 */
export function TeamverAttachChipVisual({
  name,
  mimeType,
  previewUrl,
  className = "teamver-home-slide-create-chip-visual",
  iconClassName = "teamver-home-slide-create-chip-visual--icon",
  thumbClassName = "teamver-home-slide-create-chip-thumb",
  iconSize = 14,
  testId = "teamver-attach-chip-icon",
}: Props) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const iconName = driveImportAssetIconName(name, mimeType);
  const showThumb = Boolean(previewUrl) && !thumbFailed;

  useEffect(() => {
    setThumbFailed(false);
  }, [previewUrl]);

  if (showThumb && previewUrl) {
    return (
      <span className={className} aria-hidden>
        <img
          src={previewUrl}
          alt=""
          className={thumbClassName}
          decoding="async"
          loading="lazy"
          draggable={false}
          onError={() => setThumbFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`${className} ${iconClassName}`.trim()}
      aria-hidden
      data-testid={testId}
      data-icon={iconName}
    >
      <Icon name={iconName} size={iconSize} />
    </span>
  );
}
