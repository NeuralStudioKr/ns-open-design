import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import {
  driveImportAssetIconName,
  isDriveImageAsset,
} from "../driveFileVisual";
import {
  fetchTeamverDriveImportThumbnails,
  peekTeamverDriveImportThumbnail,
} from "../driveImportThumbnails";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import { TeamverDriveDisplayFileName } from "./TeamverDriveDisplayFileName";

type Props = {
  stagedFiles: File[];
  stagedDriveAssets: TeamverDriveImportAsset[];
  confirming?: boolean;
  workspaceId?: string | null;
  removeAttachLabel: string;
  onRemoveFile?: (index: number) => void;
  onRemoveDriveAsset?: (assetId: string) => void;
};

function filePreviewKey(file: File, index: number): string {
  return `file:${index}:${file.name}:${file.size}:${file.lastModified}`;
}

function useLocalImagePreviewUrls(files: File[]): Map<string, string> {
  const signature = files
    .map((file, index) => filePreviewKey(file, index))
    .join("|");

  const urls = useMemo(() => {
    const next = new Map<string, string>();
    files.forEach((file, index) => {
      if (!isDriveImageAsset(file.name, file.type)) return;
      if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
      next.set(filePreviewKey(file, index), URL.createObjectURL(file));
    });
    return next;
    // Recreate only when the staged file identity set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    return () => {
      for (const url of urls.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    };
  }, [urls]);

  return urls;
}

function useDriveImageThumbUrls(
  workspaceId: string | null | undefined,
  assets: TeamverDriveImportAsset[],
): Map<string, string> {
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(() => new Map());
  const ws = workspaceId?.trim() ?? "";
  const assetSignature = assets
    .map((asset) => `${asset.assetId}:${asset.filename ?? ""}:${asset.mimeType ?? ""}`)
    .join("|");

  useEffect(() => {
    if (!ws || assets.length === 0) {
      setThumbUrls(new Map());
      return;
    }

    const seeded = new Map<string, string>();
    const requests: Array<{ assetId: string; name: string; mimeType?: string }> = [];
    for (const asset of assets) {
      const name = asset.filename?.trim() || asset.assetId;
      if (!isDriveImageAsset(name, asset.mimeType)) continue;
      const cached = peekTeamverDriveImportThumbnail(ws, asset.assetId);
      if (cached) seeded.set(asset.assetId, cached);
      else {
        requests.push({
          assetId: asset.assetId,
          name,
          mimeType: asset.mimeType,
        });
      }
    }
    setThumbUrls(seeded);
    if (requests.length === 0) return;

    let canceled = false;
    void fetchTeamverDriveImportThumbnails({ workspaceId: ws, items: requests }).then((next) => {
      if (canceled || next.size === 0) return;
      setThumbUrls((current) => {
        const merged = new Map(current);
        for (const [assetId, url] of next) merged.set(assetId, url);
        return merged;
      });
    });
    return () => {
      canceled = true;
    };
    // Intentionally keyed by asset signature + workspace, not asset object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, assetSignature]);

  return thumbUrls;
}

function ChipVisual({
  name,
  mimeType,
  previewUrl,
}: {
  name: string;
  mimeType?: string;
  previewUrl?: string | null;
}) {
  if (previewUrl) {
    return (
      <span className="teamver-home-slide-create-chip-visual" aria-hidden>
        <img
          src={previewUrl}
          alt=""
          className="teamver-home-slide-create-chip-thumb"
          decoding="async"
        />
      </span>
    );
  }
  const iconName = driveImportAssetIconName(name, mimeType);
  return (
    <span
      className="teamver-home-slide-create-chip-visual teamver-home-slide-create-chip-visual--icon"
      aria-hidden
      data-testid="teamver-home-slide-create-chip-icon"
      data-icon={iconName}
    >
      <Icon name={iconName} size={14} />
    </span>
  );
}

export function HomeSlideCreateAttachChips({
  stagedFiles,
  stagedDriveAssets,
  confirming = false,
  workspaceId = null,
  removeAttachLabel,
  onRemoveFile,
  onRemoveDriveAsset,
}: Props) {
  const localPreviewUrls = useLocalImagePreviewUrls(stagedFiles);
  const driveThumbUrls = useDriveImageThumbUrls(workspaceId, stagedDriveAssets);

  if (stagedFiles.length === 0 && stagedDriveAssets.length === 0) return null;

  return (
    <ul className="teamver-home-slide-create-chips" data-testid="teamver-home-slide-create-chips">
      {stagedFiles.map((file, index) => {
        const key = filePreviewKey(file, index);
        const previewUrl = localPreviewUrls.get(key) ?? null;
        return (
          <li
            key={key}
            className="teamver-home-slide-create-chip"
            data-testid="teamver-home-slide-create-chip-file"
            data-filename={file.name}
          >
            <ChipVisual name={file.name} mimeType={file.type} previewUrl={previewUrl} />
            <TeamverDriveDisplayFileName
              name={file.name}
              className="teamver-home-slide-create-chip-name"
            />
            <button
              type="button"
              aria-label={removeAttachLabel}
              disabled={confirming}
              onClick={() => onRemoveFile?.(index)}
            >
              ×
            </button>
          </li>
        );
      })}
      {stagedDriveAssets.map((asset) => {
        const name = asset.filename?.trim() || asset.assetId;
        const previewUrl = driveThumbUrls.get(asset.assetId) ?? null;
        return (
          <li
            key={`drive-${asset.assetId}`}
            className="teamver-home-slide-create-chip"
            data-testid="teamver-home-slide-create-chip-drive"
            data-asset-id={asset.assetId}
          >
            <ChipVisual name={name} mimeType={asset.mimeType} previewUrl={previewUrl} />
            <TeamverDriveDisplayFileName
              name={name}
              className="teamver-home-slide-create-chip-name"
            />
            <button
              type="button"
              aria-label={removeAttachLabel}
              disabled={confirming}
              onClick={() => onRemoveDriveAsset?.(asset.assetId)}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
