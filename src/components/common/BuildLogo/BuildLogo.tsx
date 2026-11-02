import { useTranslation } from '../../../lib/i18n';
import { LOGO_CUTS, LOGO_STYLE, type LogoStyle } from './logoPaths';
import styles from './BuildLogo.module.scss';

/** The logo's cap height as a share of its drawing's height (the letters are 70 units in a 137.2 unit tall viewBox). */
const CAP_SHARE = 70 / 137.2;
/** Under this cap height, in CSS px, the small cut is drawn: the full one loses its thin strokes below it. */
export const SMALL_CAP_HEIGHT_PX = 12;

interface BuildLogoProps {
  /** The drawing's height in CSS px; the width follows the logo's proportions. */
  height?: number;
  /** muted is the quiet default; primary is the body text color. Never the accent. */
  tone?: 'muted' | 'primary';
  /** outline or inverted; defaults to the one constant in logoPaths. */
  logoStyle?: LogoStyle;
  /** The accessible name; a host with its own translations passes it. Defaults to the app's BUILD string. */
  label?: string;
  className?: string;
}

/** Which cut a drawing of this height uses. */
export function logoCutFor(height: number): 'small' | 'full' {
  return height * CAP_SHARE < SMALL_CAP_HEIGHT_PX ? 'small' : 'full';
}

/** The BUILD logo, drawn inline in a neutral theme color. A quiet identifier, not a button. */
export function BuildLogo({ height = 24, tone = 'muted', logoStyle = LOGO_STYLE, label, className }: BuildLogoProps) {
  const { t } = useTranslation();
  const cut = LOGO_CUTS[logoStyle][logoCutFor(height)];
  const [, , w, h] = cut.viewBox.split(' ').map(Number);
  return (
    <svg
      className={[styles.logo, tone === 'primary' ? styles.primary : styles.muted, className].filter(Boolean).join(' ')}
      viewBox={cut.viewBox}
      height={height}
      width={(height * w) / h}
      fill="currentColor"
      role="img"
      aria-label={label ?? t('panel.widget.build.badge')}
    >
      {cut.paths.map((p) => <path key={p.d} d={p.d} fillRule={p.evenOdd ? 'evenodd' : undefined} />)}
    </svg>
  );
}
