import { ExternalLink, type LucideIcon } from 'lucide-react';
import classNames from 'classnames';
import styles from './TroubleshootLink.module.scss';

interface TroubleshootLinkProps {
  label: string;
  /** Opens this URL in a new tab. Without it the link is a button that calls `onClick`. */
  href?: string;
  onClick?: () => void;
  /** Leading glyph. Defaults to the external-link glyph for `href` links and none for buttons. */
  icon?: LucideIcon;
  className?: string;
}

/** The dim troubleshooting text link: an outside page in a new tab (with the external-link glyph), or a button (glyph-less unless `icon` is given) for an in-app fix flow. */
export function TroubleshootLink({ label, href, onClick, icon, className }: TroubleshootLinkProps) {
  const Icon = icon ?? (href ? ExternalLink : undefined);
  const body = (
    <>
      {Icon && <Icon size={12} aria-hidden />}
      {label}
    </>
  );
  if (href) {
    return (
      <a className={classNames(styles.link, className)} href={href} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  }
  return (
    <button type="button" className={classNames(styles.link, className)} onClick={onClick}>
      {body}
    </button>
  );
}
