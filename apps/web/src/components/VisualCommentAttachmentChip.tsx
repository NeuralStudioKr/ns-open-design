import type { ChatCommentAttachment } from '../types';
import { commentTargetDisplayName } from '../comments';
import { isVisualCommentAttachment } from '../edit-mode/scoped-deck-patch';
import { isPendingAnnotationPath } from '../utils/annotationPendingUpload';
import {
  isEphemeralDrawingScreenshotPath,
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
  variant = 'composer',
  t,
}: {
  attachment: ChatCommentAttachment;
  projectId: string | null;
  projectFileNames?: ReadonlySet<string> | readonly string[];
  localPreviewUrl?: string | null;
  onRemove?: (id: string) => void;
  showRemove?: boolean;
  /** Composer staging row vs chat history — both use the same compact chip layout. */
  variant?: 'composer' | 'history';
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
  const filesIndexReady = nameSet !== undefined;
  const fileIndexed = projectFilePathExists(nameSet, screenshotPath);
  const isPending = isPendingAnnotationPath(screenshotPath);
  // Composer: `/files` can lag a fresh upload — allow one remote probe (shared
  // 404 cache stops repeats). History: never probe deleted drawings; wait for
  // the file index and only fetch when the path is still listed.
  const canAttemptRemoteFetch =
    Boolean(screenshotPath)
    && Boolean(projectId)
    && !isPending
    && (
      variant !== 'history'
        ? true
        : filesIndexReady && fileIndexed
    );
  const canShowRemoteThumb = canAttemptRemoteFetch;
  // Indexed drawing screenshots can outlive storage (GC / sync). Never
  // trustExists for them — chat thumbnails should 404 once and stop.
  const trustExists =
    isPending
    || (fileIndexed && !isEphemeralDrawingScreenshotPath(screenshotPath));
  const showThumb = isVisual && (canShowLocalThumb || canShowRemoteThumb);
  const thumbClass = 'visual-comment-attachment-thumb';
  const label = commentTargetDisplayName(attachment);
  const comment = String(attachment.comment || '').trim();
  const displayText = comment || label;
  const title = comment ? `${label}: ${comment}` : label;

  return (
    <div
      className={[
        'visual-comment-attachment-chip',
        'staged-chip',
        'staged-comment',
        showThumb ? 'staged-comment--visual' : '',
        variant === 'history' ? 'visual-comment-attachment-chip--history' : '',
      ].filter(Boolean).join(' ')}
      data-testid="visual-comment-attachment-chip"
      title={title}
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
              trustExists={trustExists}
            />
          ) : null}
        </span>
      ) : (
        <span className="visual-comment-attachment-icon" aria-hidden>
          <Icon name="image" size={11} />
        </span>
      )}
      <span className="visual-comment-attachment-label">{displayText}</span>
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
