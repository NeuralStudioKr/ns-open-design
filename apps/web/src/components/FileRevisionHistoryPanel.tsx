import { useEffect, useState } from 'react';
import type { FileRevision } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { useI18n } from '../i18n';
import { revisionSourceIcon } from '../runtime/revision-source';
import { RemixIcon } from './RemixIcon';
import styles from './FileRevisionHistoryPanel.module.css';

type FileRevisionHistoryPanelProps = {
  revisions: FileRevision[];
  cursorRevisionId: string | null;
  retentionLimit: number;
  retentionPending?: boolean;
  busy?: boolean;
  onRestore: (revision: FileRevision) => void;
  onClose: () => void;
};

function formatRevisionTime(createdAt: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(createdAt));
  } catch {
    return new Date(createdAt).toLocaleString();
  }
}

export function FileRevisionHistoryPanel({
  revisions,
  cursorRevisionId,
  retentionLimit,
  retentionPending = false,
  busy = false,
  onRestore,
  onClose,
}: FileRevisionHistoryPanelProps) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const ordered = [...revisions].reverse();

  return (
    <aside className={styles.panel} data-testid="file-revision-history-panel">
      <header className={styles.head}>
        <h3 className={styles.title}>{t('fileRevision.history.title')}</h3>
        <Button
          variant="ghost"
          className={styles.closeButton}
          onClick={onClose}
          aria-label={t('fileRevision.history.close')}
        >
          ×
        </Button>
      </header>
      {ordered.length > 0 ? (
        <p className={styles.retentionHint} data-testid="file-revision-history-retention-hint">
          {retentionPending
            ? t('fileRevision.history.retentionPending')
            : t('fileRevision.history.retentionHint', { count: retentionLimit })}
        </p>
      ) : null}
      {ordered.length === 0 ? (
        <div className={styles.empty} data-testid="file-revision-history-empty">
          {t('fileRevision.history.empty')}
        </div>
      ) : (
        <ol className={styles.list}>
          {ordered.map((revision) => {
            const isActive = revision.id === cursorRevisionId;
            return (
              <li
                key={revision.id}
                className={`${styles.item}${isActive ? ` ${styles.itemActive}` : ''}`}
                data-testid={`file-revision-history-item-${revision.sequence}`}
              >
                <span className={styles.iconWrap} aria-hidden>
                  <RemixIcon name={revisionSourceIcon(revision.source)} size={14} />
                </span>
                <div className={styles.itemBody}>
                  <span className={styles.label} title={revision.label}>
                    {revision.label}
                  </span>
                  <span className={styles.meta}>
                    {formatRevisionTime(revision.createdAt, locale)}
                    {isActive ? ` · ${t('fileRevision.history.current')}` : ''}
                  </span>
                </div>
                {!isActive ? (
                  <Button
                    variant="ghost"
                    className={styles.restoreButton}
                    disabled={busy}
                    data-testid={`file-revision-restore-${revision.sequence}`}
                    onClick={() => onRestore(revision)}
                  >
                    {t('fileRevision.history.restore')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
