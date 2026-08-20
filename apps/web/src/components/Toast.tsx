// Lightweight transient toast for the new project-actions toolbar
// (Continue in CLI / Finalize design package — #451). Mirrors the
// canonical state-based pattern from PromptTemplatePreviewModal:
// transient state cleared on a setTimeout, no portal, no DOM
// imperative work. Single-toast queue; multi-toast support is
// deliberately deferred to a follow-up.
//
// Renders an optional secondary `details` line beneath the primary
// message so daemon error envelopes that carry an upstream
// explanation (e.g. Anthropic account-usage-cap reasons) can surface
// the real upstream message alongside the daemon's category label.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

import { Icon } from './Icon';
import { toastSlideUp } from '../motion';
import { useT } from '../i18n';

export interface ToastProps {
  message: string;
  details?: string | null;
  /** When set with `details`, renders the details line as an external link. */
  detailsHref?: string | null;
  /** Multiple external links rendered beneath the message (e.g. partial publish). */
  detailLinks?: Array<{ label: string; href: string }>;
  // Optional code/preformatted body. When present the toast pins
  // itself open (no auto-dismiss) so the user has time to manually
  // copy the content. Used for the clipboard-failure recovery path
  // in Continue in CLI: when copyToClipboard returns false the
  // prepared prompt is rendered here so the user can select-and-copy
  // it manually.
  code?: string | null;
  ttlMs?: number;
  onDismiss?: () => void;
  /** ARIA role. Use "alert" for error messages (announced immediately),
   *  "status" (default) for non-urgent confirmations. */
  role?: 'status' | 'alert';
  tone?: 'default' | 'success' | 'error' | 'loading';
  placement?: 'bottom' | 'top';
  /** Single-row layout for save confirmations with inline undo. */
  layout?: 'default' | 'compact';
  actionLabel?: string;
  onAction?: () => void;
}

const DEFAULT_TTL = 4000;
// Exit fade duration — kept in sync with the .od-toast.leaving CSS animation.
// The fade plays inside the TTL window (it begins at ttlMs - EXIT_MS) so the
// toast unmounts at exactly ttlMs. Auto-dismiss timing therefore matches the
// pre-fade contract: callers that rely on the toast being gone by ttlMs keep
// working, and the exit animation no longer extends the toast's lifetime.
const EXIT_MS = 160;

// A leading status glyph makes the toast's outcome readable at a glance:
// a check for confirmations, a warning triangle for failures, and a spinner
// while an action is in flight. Error toasts keep the close icon on the
// dismiss button only so we do not show two identical X glyphs.
const TONE_ICON: Record<NonNullable<ToastProps['tone']>, 'alert-triangle' | 'check' | 'spinner' | null> = {
  default: null,
  success: 'check',
  error: 'alert-triangle',
  loading: 'spinner',
};

export function Toast({ message, details, detailsHref, detailLinks, code, ttlMs = DEFAULT_TTL, onDismiss, role = 'status', tone = 'default', placement = 'bottom', layout = 'default', actionLabel, onAction }: ToastProps) {
  const t = useT();
  // Code and in-flight loading toasts are manual/progress surfaces; never
  // auto-dismiss them out from under the user (loading is replaced by the
  // caller when the action settles).
  const effectiveTtl = code || tone === 'loading' ? 0 : ttlMs;
  const [leaving, setLeaving] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    // Re-entrant: a new message reuses the same mounted toast, so clear any
    // prior leaving state before re-arming the timers.
    setLeaving(false);
    if (!onDismissRef.current || !Number.isFinite(effectiveTtl) || effectiveTtl <= 0) return;
    // Begin the fade-out EXIT_MS before the deadline so the exit animation
    // plays within the TTL window and onDismiss (which unmounts us) lands at
    // exactly effectiveTtl. Clamp the fade start to 0 for very short TTLs.
    const fadeAt = Math.max(0, effectiveTtl - EXIT_MS);
    const fadeId = window.setTimeout(() => setLeaving(true), fadeAt);
    const dismissId = window.setTimeout(() => onDismissRef.current?.(), effectiveTtl);
    return () => {
      window.clearTimeout(fadeId);
      window.clearTimeout(dismissId);
    };
  }, [message, details, code, tone, effectiveTtl]);

  const iconName = TONE_ICON[tone];
  const closeLabel = t('common.close');
  const dismissIconButton = onDismiss && !code ? (
    <button
      type="button"
      className="od-toast-dismiss"
      onClick={onDismiss}
      aria-label={closeLabel}
    >
      <Icon name="close" size={14} />
    </button>
  ) : null;

  // Positioning lives on the anchor so Motion's transform (y/scale) does not
  // overwrite CSS horizontal centering.
  return (
    <div className={`od-toast-anchor placement-${placement}`}>
      <motion.div
        className={`od-toast tone-${tone} placement-${placement} layout-${layout}${leaving ? ' leaving' : ''}`}
        role={role}
        aria-live={role === 'alert' ? 'assertive' : 'polite'}
        aria-busy={tone === 'loading' ? true : undefined}
        variants={toastSlideUp}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {layout === 'compact' ? (
          <div className="od-toast-compact-row">
            <div className="od-toast-body">
              {iconName ? (
                <span className="od-toast-icon" aria-hidden>
                  <Icon name={iconName} size={15} />
                </span>
              ) : null}
              <div className="od-toast-compact-copy">
                <div className="od-toast-message">{message}</div>
                {details ? <span className="od-toast-detail-chip">{details}</span> : null}
              </div>
            </div>
            <div className="od-toast-compact-actions">
              {actionLabel && onAction ? (
                <button
                  type="button"
                  className="od-toast-action od-toast-action-inline"
                  onClick={() => {
                    onAction();
                    onDismiss?.();
                  }}
                >
                  {actionLabel}
                </button>
              ) : null}
              {onDismiss ? (
                <button
                  type="button"
                  className="od-toast-dismiss"
                  onClick={onDismiss}
                  aria-label={closeLabel}
                >
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="od-toast-row">
              <div className="od-toast-body">
                {iconName ? (
                  <span className="od-toast-icon" aria-hidden>
                    <Icon name={iconName} size={14} />
                  </span>
                ) : null}
                <div className="od-toast-message">{message}</div>
              </div>
              {dismissIconButton}
            </div>
            {detailLinks && detailLinks.length > 0 ? (
              <div className="od-toast-detail-links">
                {detailLinks.map((link) => (
                  <a
                    key={`${link.href}-${link.label}`}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
            {details && !(detailLinks && detailLinks.length > 0) ? (
              <div className="od-toast-details">
                {detailsHref ? (
                  <a href={detailsHref} target="_blank" rel="noreferrer noopener">
                    {details}
                  </a>
                ) : (
                  details
                )}
              </div>
            ) : null}
            {actionLabel && onAction ? (
              <button
                type="button"
                className="od-toast-action"
                onClick={() => {
                  onAction();
                  onDismiss?.();
                }}
              >
                {actionLabel}
              </button>
            ) : null}
            {code ? (
              <pre className="od-toast-code">{code}</pre>
            ) : null}
            {code && onDismiss ? (
              <button
                type="button"
                className="od-toast-dismiss od-toast-dismiss-text"
                onClick={onDismiss}
                aria-label={closeLabel}
              >
                {closeLabel}
              </button>
            ) : null}
          </>
        )}
      </motion.div>
    </div>
  );
}
