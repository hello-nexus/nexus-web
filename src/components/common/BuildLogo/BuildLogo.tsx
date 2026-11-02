import { useTranslation } from '../../../lib/i18n';
import { LOGO } from './logoPaths';
import styles from './BuildLogo.module.scss';

interface BuildLogoProps {
  /** The drawing's height in CSS px; the width follows the artwork's proportions. */
  height?: number;
  /** contrast is the theme's full-contrast ink (pure white on dark, pure black on light, the default); muted is the dim text token; primary the body text color. Never the accent. */
  tone?: 'contrast' | 'muted' | 'primary';
  /** The accessible name; a host with its own translations passes it. Defaults to the app's BUILD string. */
  label?: string;
  className?: string;
}

const [, , VIEW_WIDTH, VIEW_HEIGHT] = LOGO.viewBox.split(' ').map(Number);

/** The BUILD logo, drawn inline in a neutral theme color. A quiet identifier, not a button. */
export function BuildLogo({ height = 24, tone = 'contrast', label, className }: BuildLogoProps) {
  const { t } = useTranslation();
  return (
    <svg
      className={[styles.logo, styles[tone], className].filter(Boolean).join(' ')}
      viewBox={LOGO.viewBox}
      height={height}
      width={(height * VIEW_WIDTH) / VIEW_HEIGHT}
      fill="currentColor"
      role="img"
      aria-label={label ?? t('panel.widget.build.badge')}
    >
      {LOGO.paths.map((p) => <path key={p.d} d={p.d} fillRule={p.evenOdd ? 'evenodd' : undefined} />)}
    </svg>
  );
}
