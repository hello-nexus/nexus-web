import type { ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { CardDeleteButton } from '../CardDeleteButton/CardDeleteButton';
import styles from './EffectCard.module.scss';

interface EffectCardProps {
  label: string;
  /** Resolved blob URL for the thumbnail image. Null renders the shimmer skeleton. */
  thumbUrl: string | null;
  active: boolean;
  onClick: () => void;
  /** Shows a speaker badge on the thumbnail (used by audio-reactive animate effects). */
  audio?: boolean;
  /** Meta line below the label - media uses it for duration. Omit to reserve the row height. */
  meta?: string;
  /** Optional delete action. Rendered as a hover-revealed X on the thumbnail. */
  onDelete?: () => void;
  deleteAriaLabel?: string;
  /**
   * When true, render as a div with role=button instead of a real <button>.
   * Required when the card contains nested interactive elements (CardDeleteButton),
   * since nested buttons are invalid HTML.
   */
  asDiv?: boolean;
  /** Overlay rendered inside the thumbnail, centred (used for the importing spinner). */
  thumbOverlay?: ReactNode;
  /** Small node pinned to the thumbnail's top-right (e.g. the live-on-RGB bulb). */
  cornerBadge?: ReactNode;
  ariaLabel?: string;
  /** Optional data attribute, used by AnimateGrid for auto-scroll-to-selected. */
  dataEffectKey?: string;
  /**
   * Overlay layout: the thumbnail fills the whole card edge-to-edge and the
   * label is drawn on top of it (lower third, stroked + shadowed so it stays
   * legible over any screenshot). Used by the shader browser. Off by default
   * so the media library keeps its image-above-caption layout.
   */
  overlay?: boolean;
}

export function EffectCard({
  label, thumbUrl, active, onClick,
  audio, meta, onDelete, deleteAriaLabel,
  asDiv, thumbOverlay, cornerBadge, ariaLabel, dataEffectKey, overlay,
}: EffectCardProps) {
  const { t } = useTranslation();
  const className = `${styles.card} ${overlay ? styles.cardOverlay : ''} ${active ? styles.cardActive : ''}`;
  const inner = (
    <>
      <div className={styles.thumbWrap}>
        {thumbUrl
          ? <img className={styles.thumbImg} src={thumbUrl} alt={label} />
          : <div className={styles.thumbSkeleton} aria-hidden="true" />}
        {audio && (
          <svg className={styles.audioBadge} width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5a1.5 1.5 0 1 0 3 0v-7l6 -1.5v7" />
            <circle cx="10.5" cy="9.5" r="1.5" />
          </svg>
        )}
        {thumbOverlay}
        {cornerBadge}
        {onDelete && (
          <CardDeleteButton
            className={styles.deleteBtnSlot}
            onDelete={onDelete}
            ariaLabel={deleteAriaLabel ?? t('common.delete')}
          />
        )}
        {overlay && <span className={styles.labelOverlay}>{label}</span>}
      </div>
      {!overlay && <span className={styles.label}>{label}</span>}
      {!overlay && meta !== undefined && <span className={styles.meta}>{meta}</span>}
    </>
  );

  if (asDiv) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={className}
        onClick={onClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        aria-pressed={active}
        aria-label={ariaLabel ?? label}
        data-effect-key={dataEffectKey}
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      data-effect-key={dataEffectKey}
    >
      {inner}
    </button>
  );
}
