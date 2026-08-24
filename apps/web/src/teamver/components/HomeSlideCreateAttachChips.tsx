import { useEffect, useMemo, useRef, useState } from "react";
import {
  isDriveImageAsset,
} from "../driveFileVisual";
import {
  fetchTeamverDriveImportThumbnails,
  peekTeamverDriveImportThumbnail,
} from "../driveImportThumbnails";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import { TeamverAttachChipVisual } from "./TeamverAttachChipVisual";
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

function localFileIdentity(file: File): string {
  return `${file.name}\0${file.size}\0${file.lastModified}\0${file.type}`;
}

/**
 * Object-URL previews keyed by the File object itself so removing a middle
 * chip does not recreate URLs for every later file (index-based keys did).
 * Effect deps use a content signature so a new array wrapper with the same
 * File identities does not churn revoke/create.
 */
function useLocalImagePreviewUrls(files: File[]): Map<File, string> {
  const [urls, setUrls] = useState(() => new Map<File, string>());
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const filesRef = useRef(files);
  filesRef.current = files;
  const fileSignature = useMemo(
    () => files.map(localFileIdentity).join("|"),
    [files],
  );

  useEffect(() => {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      setUrls(new Map());
      return;
    }

    const currentFiles = filesRef.current;
    setUrls((prev) => {
      const next = new Map<File, string>();
      const keep = new Set(currentFiles);
      for (const file of currentFiles) {
        if (!isDriveImageAsset(file.name, file.type)) continue;
        const existing = prev.get(file);
        if (existing) {
          next.set(file, existing);
          continue;
        }
        next.set(file, URL.createObjectURL(file));
      }
      for (const [file, url] of prev) {
        if (keep.has(file) && next.has(file)) continue;
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, [fileSignature]);

  useEffect(() => {
    return () => {
      for (const url of urlsRef.current.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return urls;
}

function useDriveImageThumbUrls(
  workspaceId: string | null | undefined,
  assets: TeamverDriveImportAsset[],
): Map<string, string> {
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(() => new Map());
  const ws = workspaceId?.trim() ?? "";
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const assetSignature = useMemo(
    () =>
      assets
        .map(
          (asset) =>
            `${asset.assetId}:${asset.filename ?? ""}:${asset.mimeType ?? ""}:${asset.sharedDriveId ?? ""}`,
        )
        .join("|"),
    [assets],
  );

  useEffect(() => {
    const currentAssets = assetsRef.current;
    if (!ws || currentAssets.length === 0) {
      setThumbUrls(new Map());
      return;
    }

    const seeded = new Map<string, string>();
    const requests: Array<{
      assetId: string;
      name: string;
      mimeType?: string;
      sharedDriveId?: string | null;
    }> = [];
    for (const asset of currentAssets) {
      const name = asset.filename?.trim() || asset.assetId;
      if (!isDriveImageAsset(name, asset.mimeType)) continue;
      const cached = peekTeamverDriveImportThumbnail(ws, asset.assetId);
      if (cached) seeded.set(asset.assetId, cached);
      else {
        requests.push({
          assetId: asset.assetId,
          name,
          mimeType: asset.mimeType,
          sharedDriveId: asset.sharedDriveId ?? null,
        });
      }
    }
    setThumbUrls(seeded);
    if (requests.length === 0) return;

    let canceled = false;
    void fetchTeamverDriveImportThumbnails({ workspaceId: ws, items: requests })
      .then((next) => {
        if (canceled || next.size === 0) return;
        setThumbUrls((current) => {
          const merged = new Map(current);
          for (const [assetId, url] of next) merged.set(assetId, url);
          return merged;
        });
      })
      .catch(() => {
        /* keep seeded / prior thumbs */
      });
    return () => {
      canceled = true;
    };
  }, [ws, assetSignature]);

  return thumbUrls;
}

function removeLabelFor(base: string, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return base;
  return `${base}: ${trimmed}`;
}

function fileChipKey(file: File): string {
  // Home blocks duplicate attaches by name+size+lastModified, so this is stable
  // across middle-chip removal (index-in-key remounted later chips).
  return `file:${localFileIdentity(file)}`;
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
        const previewUrl = localPreviewUrls.get(file) ?? null;
        return (
          <li
            key={fileChipKey(file)}
            className="teamver-home-slide-create-chip"
            data-testid="teamver-home-slide-create-chip-file"
            data-filename={file.name}
            title={file.name}
          >
            <TeamverAttachChipVisual
              name={file.name}
              mimeType={file.type}
              previewUrl={previewUrl}
              testId="teamver-home-slide-create-chip-icon"
            />
            <TeamverDriveDisplayFileName
              name={file.name}
              className="teamver-home-slide-create-chip-name"
            />
            <button
              type="button"
              aria-label={removeLabelFor(removeAttachLabel, file.name)}
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
            title={name}
          >
            <TeamverAttachChipVisual
              name={name}
              mimeType={asset.mimeType}
              previewUrl={previewUrl}
              testId="teamver-home-slide-create-chip-icon"
            />
            <TeamverDriveDisplayFileName
              name={name}
              className="teamver-home-slide-create-chip-name"
            />
            <button
              type="button"
              aria-label={removeLabelFor(removeAttachLabel, name)}
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
