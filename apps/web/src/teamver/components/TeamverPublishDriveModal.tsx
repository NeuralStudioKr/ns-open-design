import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import { drivePublishMessaging } from "../drivePublishMessaging";
import {
  TeamverPublishDrivePanel,
  type TeamverPublishDrivePanelProps,
} from "./TeamverPublishDrivePanel";

type Props = Omit<TeamverPublishDrivePanelProps, "active"> & {
  open: boolean;
};

export function TeamverPublishDriveModal({
  open,
  onClose,
  ...panelProps
}: Props) {
  const backdropMouseDownRef = useRef(false);
  const messaging = drivePublishMessaging();

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    (
      <div
        className="teamver-drive-picker-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          backdropMouseDownRef.current = event.target === event.currentTarget;
        }}
        onMouseUp={(event) => {
          if (event.target === event.currentTarget && backdropMouseDownRef.current) onClose();
          backdropMouseDownRef.current = false;
        }}
      >
        <section
          className="teamver-drive-picker-modal teamver-drive-publish-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="teamver-drive-publish-title"
          data-testid="teamver-publish-drive-modal"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="teamver-drive-picker-head">
            <div>
              <h2 id="teamver-drive-publish-title">{messaging.modalTitle}</h2>
              <p>{messaging.modalSubtitle}</p>
            </div>
            <button
              type="button"
              className="teamver-drive-picker-close"
              aria-label="드라이브 올리기 닫기"
              data-testid="teamver-publish-drive-modal-close"
              onClick={onClose}
            >
              <Icon name="close" size={16} />
            </button>
          </header>
          <div className="teamver-drive-publish-modal-body">
            <TeamverPublishDrivePanel
              {...panelProps}
              active={open}
              onClose={onClose}
            />
          </div>
        </section>
      </div>
    ),
    document.body,
  );
}
