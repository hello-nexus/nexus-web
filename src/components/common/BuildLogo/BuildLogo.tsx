import { useTranslation } from '../../../lib/i18n';
import styles from './BuildLogo.module.scss';

// In em of the type size: the outer corner is 7/24 of the box height (1.885em), the same ratio as BuildIcon's rounded square.
const CORNER_RADIUS = '0.55em';

interface BuildLogoProps {
  /** contrast is the theme's full-contrast ink (pure white on dark, pure black on light); muted is the dim text token; primary the body text color (the default). Never the accent. */
  tone?: 'contrast' | 'muted' | 'primary';
  /** The type size in CSS px; padding, corner radius and stroke scale with it. Omitted, the body type token applies. */
  fontSize?: number;
  /** The accessible name; a host with its own translations passes it. Defaults to the app's BUILD string. */
  label?: string;
  className?: string;
}

/** The BUILD logo: the name in the label style inside a rounded outline. A quiet identifier, not a button. */
export function BuildLogo({ tone = 'primary', fontSize, label, className }: BuildLogoProps) {
  const { t } = useTranslation();
  return (
    <span
      className={[styles.logo, styles[tone], className].filter(Boolean).join(' ')}
      style={{ borderRadius: CORNER_RADIUS, ...(fontSize ? { fontSize } : {}) }}
      role="img"
      aria-label={label ?? t('panel.widget.build.badge')}
    >
      <span aria-hidden="true">{t('panel.widget.build.badge')}</span>
    </span>
  );
}
