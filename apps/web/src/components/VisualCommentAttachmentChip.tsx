import type { ChatCommentAttachment } from '../types';
import { commentTargetDisplayName } from '../comments';
import { isVisualCommentAttachment } from '../edit-mode/scoped-deck-patch';
import { isPendingAnnotationPath } from '../utils/annotationPendingUpload';
import {
  isUserAnnotationDrawingScreenshotPath,
  projectFilePathExists,
} from '../utils/projectFilePaths';
import { AuthenticatedProjectFileImage } from './AuthenticatedProjectFileImage';
import { Icon } from './Icon';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function VisualCommentAttachmentChip({
  attachment,
  projectId,
  projectFileNames,
  localPreviewUrl,
  onRemove,
  showRemove = false,
  t,
}: {
  attachment: ChatCommentAttachment;
  projectId: string | null;
  projectFileNames?: ReadonlySet<string> | readonly string[];
  localPreviewUrl?: string | null;
  onRemove?: (id: string) => void;
  showRemove?: boolean;
  t?: TranslateFn;
}) {
  const screenshotPath = String(attachment.screenshotPath || '').trim();
  const isVisual = isVisualCommentAttachment(attachment);
  const nameSet =
    projectFileNames instanceof Set
      ? projectFileNames
      : projectFileNames
        ? new Set(projectFileNames)
        : undefined;
  const canShowLocalThumb = Boolean(localPreviewUrl);
  const canShowRemoteThumb =
    Boolean(screenshotPath)
    && Boolean(projectId)
    && (
      isPendingAnnotationPath(screenshotPath)
      || isUserAnnotationDrawingScreenshotPath(screenshotPath)
      || projectFilePathExists(nameSet, screenshotPath)
    );
  const showThumb = isVisual && (canShowLocalThumb || canShowRemoteThumb);
  const thumbClass = 'visual-comment-attachment-thumb';
  const title = attachment.comment
    ? `${commentTargetDisplayName(attachment)}: ${attachment.comment}`
    : commentTargetDisplayName(attachment);

  return (
    <div
      className={[
        'visual-comment-attachment-chip',
        'staged-chip',
        'staged-comment',
        showThumb ? 'staged-comment--visual' : '',
      ].filter(Boolean).join(' ')}
      data-testid="visual-comment-attachment-chip"
    >
      {showThumb ? (
        <span className="visual-comment-attachment-thumb-wrap" aria-hidden>
          {canShowLocalThumb ? (
            <img src={localPreviewUrl!} alt="" decoding="async" className={thumbClass} />
          ) : projectId ? (
            <AuthenticatedProjectFileImage
              projectId={projectId}
              path={screenshotPath}
              alt=""
              className={thumbClass}
              trustExists
            />
          ) : null}
        </span>
      ) : null}
      <span className="staged-name" title={title}>
        <strong>{commentTargetDisplayName(attachment)}</strong>
        {attachment.comment ? <span>{attachment.comment}</span> : null}
      </span>
      {showRemove && onRemove ? (
        <button
          type="button"
          className="staged-remove od-tooltip"
          onClick={() => onRemove(attachment.id)}
          title={t?.('chat.comments.removeAttachment') ?? 'Remove'}
          data-tooltip={t?.('chat.comments.removeAttachment') ?? 'Remove'}
          aria-label={
            t?.('chat.comments.removeAttachmentAria', { name: attachment.elementId })
            ?? `Remove ${attachment.elementId}`
          }
        >
          <Icon name="close" size={11} />
        </button>
      ) : null}
    </div>
  );
}
