import { useTranslation } from '../../../lib/i18n';
import styles from './BuildLogo.module.scss';

interface BuildLogoProps {
  /** contrast is the theme's full-contrast ink (pure white on dark, pure black on light); muted is the dim text token; primary the body text color (the default). Never the accent. */
  tone?: 'contrast' | 'muted' | 'primary';
  /** The type size in CSS px, with the padding scaled to it. Omitted, the body type token and its stylesheet padding apply. */
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
      style={fontSize ? { fontSize, padding: `${fontSize * 0.3}px ${fontSize * 0.6}px` } : undefined}
      role="img"
      aria-label={label ?? t('panel.widget.build.badge')}
    >
      <span aria-hidden="true">{t('panel.widget.build.badge')}</span>
    </span>
  );
}
