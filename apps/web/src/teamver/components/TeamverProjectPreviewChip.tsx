import { Icon } from "../../components/Icon";
import { useT } from "../../i18n";
import { isTeamverEmbedMode } from "../designApiBase";

type Props = {
  projectId: string;
  fileName: string;
  onOpen: (projectId: string, options: { fileName: string }) => void;
};

/** Embed project cards — open project with latest HTML/deck file focused. */
export function TeamverProjectPreviewChip({ projectId, fileName, onOpen }: Props) {
  const t = useT();
  if (!isTeamverEmbedMode()) return null;

  const title = `${t("common.openPreview")}: ${fileName}`;

  return (
    <button
      type="button"
      className="teamver-project-preview-chip"
      title={title}
      aria-label={title}
      data-testid={`teamver-preview-chip-${projectId}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(projectId, { fileName });
      }}
    >
      <Icon name="eye" size={11} aria-hidden />
      <span>{t("common.openPreview")}</span>
    </button>
  );
}
