import { useState, type ReactNode } from 'react';
import { Music } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { CardDeleteButton } from '../CardDeleteButton/CardDeleteButton';
import { EditHint } from '../EditHint/EditHint';
import styles from './EffectCard.module.scss';

interface EffectCardBaseProps {
  label: string;
  /** Shows the label as given, for names the user chose, instead of capitalizing it. */
  keepCase?: boolean;
  /** Resolved blob URL for the thumbnail image. Null renders the shimmer skeleton. */
  thumbUrl: string | null;
  active: boolean;
  /** Shows a speaker badge on the thumbnail (used by audio-reactive animate effects). */
  audio?: boolean;
  /** Meta line below the label - media uses it for duration. Omit to reserve the row height. */
  meta?: string;
  /** Optional delete action. Rendered as a hover-revealed X on the thumbnail. */
  onDelete?: () => void;
  deleteAriaLabel?: string;
  /**
   * Shows the shared edit hint (icon-only scrim with a pencil) over the card on
   * hover for hover-capable fine pointers. The click itself is the card's
   * onClick; pass an ariaLabel that names the edit action.
   */
  editHint?: boolean;
  /** Changes whenever the tile's grid position can have changed (order, filter, collapse). Resets the pointer-presence reveal. */
  layoutKey?: string;
  /**
   * When true, render as a div with role=button instead of a real <button>.
   * Required when the card contains nested interactive elements (CardDeleteButton),
   * since nested buttons are invalid HTML.
   */
  asDiv?: boolean;
  /** Div path only: omit aria-pressed, matching the plain button path (a picker that never announced "pressed"). */
  noPressedState?: boolean;
  /** Overlay rendered inside the thumbnail, centred (used for the importing spinner). */
  thumbOverlay?: ReactNode;
  /**
   * When true and thumbUrl is null, renders a static non-animated placeholder
   * instead of the shimmer skeleton. Use when thumbnail absence is expected
   * rather than a transient loading state.
   */
  thumbStatic?: boolean;
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
  /**
   * Thumbnail aspect ratio (width / height). When provided, the thumb box uses
   * this aspect-ratio and object-fit: cover, cropping the image to fill that
   * frame. Omit for the default 16/9 cropped behavior.
   */
  thumbAspect?: number;
  /** Draw the thumbnail as a circle (round display). Pair with a square thumbAspect. The box stays square so
   *  its corner badges and delete button are not clipped. */
  thumbRound?: boolean;
  /** Overlay mode only: suppress the on-thumbnail caption (the aria-label still
   *  carries the name). Used by the simple colour swatches, which need no text. */
  hideLabel?: boolean;
  /** Subtitle in the body font instead of monospace, for prose such as a creator's name. */
  metaSans?: boolean;
}

// Interactive cards require onClick; nonInteractive cards (plain div, no
// button semantics / pointer cursor / hover ring - surfaces that display
// state rather than offer a selection, e.g. the lighting widget tile) take
// none.
type EffectCardProps = EffectCardBaseProps & (
  | { nonInteractive: true; onClick?: never }
  | { nonInteractive?: false; onClick: () => void }
);

export function EffectCard({
  label, keepCase, thumbUrl, active, onClick,
  audio, meta, onDelete, deleteAriaLabel, editHint, layoutKey,
  asDiv, noPressedState, thumbOverlay, thumbStatic, cornerBadge, ariaLabel, dataEffectKey, overlay, thumbAspect, thumbRound, hideLabel, metaSans, nonInteractive,
}: EffectCardProps) {
  const { t } = useTranslation();
  // An image that fails to load leaves the plain tile until a new one arrives, never a broken-image glyph.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // WebKit does not re-evaluate :hover for a node whose state changed under a still pointer, so the
  // hint is also revealed from tracked pointer presence (mouse and pen only, never touch).
  // Stored with the layout key it was seen under: a still pointer stays put while the grid reorders
  // or filters, and the presence then belongs to a different tile until a new pointerenter.
  const [overKey, setOverKey] = useState<string | null>(null);
  const pointerOver = overKey !== null && overKey === (layoutKey ?? '');
  const pointerProps = {
    // React enter/leave follow the component tree, so a portalled child (a tooltip) reports here too; only the card's own DOM counts.
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' && e.currentTarget.contains(e.target as Node)) setOverKey(layoutKey ?? '');
    },
    onPointerLeave: () => setOverKey(null),
    'data-edit-hint-shown': editHint && pointerOver ? 'true' : undefined,
  };
  const showImg = !!thumbUrl && thumbUrl !== failedUrl;
  const className = `${styles.card} ${editHint ? styles.cardEditable : ''} ${overlay ? styles.cardOverlay : ''} ${active ? styles.cardActive : ''} ${nonInteractive ? styles.cardStatic : ''}`;
  const thumbBoxStyle = thumbAspect !== undefined
    ? { aspectRatio: String(thumbAspect), maxHeight: '360px' }
    : undefined;
  const thumbImgStyle = thumbAspect !== undefined
    ? { objectFit: 'cover' as const, height: '100%', ...(thumbRound ? { borderRadius: '50%' } : null) }
    : undefined;
  const thumbSkeletonStyle = thumbAspect !== undefined
    ? { height: '100%', ...(thumbRound ? { borderRadius: '50%' } : null) }
    : undefined;
  const inner = (
    <>
      <div className={styles.thumbWrap} style={thumbBoxStyle}>
        {showImg
          ? <img className={styles.thumbImg} src={thumbUrl} alt={label} style={thumbImgStyle} onError={() => setFailedUrl(thumbUrl)} />
          : <div className={thumbStatic || thumbUrl ? styles.thumbStaticPlaceholder : styles.thumbSkeleton} aria-hidden="true" style={thumbSkeletonStyle} />}
        {/* Before the badge: an overlay canvas fills the thumbnail and would hide it. */}
        {thumbOverlay}
        {audio && (
          <Music className={styles.audioBadge} size={10} />
        )}
        {cornerBadge}
        {onDelete && (
          <CardDeleteButton
            className={styles.deleteBtnSlot}
            onDelete={onDelete}
            ariaLabel={deleteAriaLabel ?? t('common.delete')}
          />
        )}
        {overlay && !hideLabel && <span className={styles.labelOverlay}>{label}</span>}
      </div>
      {!overlay && <span className={`${styles.label} ${keepCase ? styles.labelAsIs : ''}`}>{label}</span>}
      {!overlay && meta !== undefined && <span className={`${styles.meta} ${metaSans ? styles.metaSans : ''}`}>{meta}</span>}
      {editHint && <EditHint className={styles.editHint} />}
    </>
  );

  if (nonInteractive) {
    return (
      <div className={className} data-effect-key={dataEffectKey}>
        {inner}
      </div>
    );
  }

  if (asDiv) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={className}
        onClick={onClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
        aria-pressed={noPressedState ? undefined : active}
        aria-label={ariaLabel ?? label}
        data-effect-key={dataEffectKey}
        {...pointerProps}
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
      {...pointerProps}
    >
      {inner}
    </button>
  );
}
