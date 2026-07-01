import {
  TeamverPublishDrivePanel,
  type TeamverPublishDrivePanelProps,
  type TeamverPublishDriveSuccessMeta,
} from "./TeamverPublishDrivePanel";

type Props = Omit<TeamverPublishDrivePanelProps, "onClose" | "active"> & {
  onCloseMenu: () => void;
  onSuccess?: (meta: TeamverPublishDriveSuccessMeta) => void;
  onError?: (err: unknown) => void;
};

/** @deprecated Prefer TeamverPublishDriveModal — kept for unit tests. */
export function TeamverPublishDriveMenuItem({
  onCloseMenu,
  ...props
}: Props) {
  return (
    <TeamverPublishDrivePanel
      {...props}
      active
      onClose={onCloseMenu}
    />
  );
}
