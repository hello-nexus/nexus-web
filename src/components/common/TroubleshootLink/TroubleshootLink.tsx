import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import classNames from 'classnames';
import styles from './TroubleshootLink.module.scss';

interface TroubleshootLinkProps {
  label: string;
  /** Opens this URL in a new tab. Without it the link is a button that calls `onClick`. */
  href?: string;
  onClick?: () => void;
  /** Leading glyph; the external-link glyph in href mode, none in button mode. */
  icon?: ReactNode;
  className?: string;
}

/** The dim "Troubleshooting" text link with the external-link glyph: an outside help page, or an in-app fix flow. */
export function TroubleshootLink({ label, href, onClick, icon, className }: TroubleshootLinkProps) {
  const glyph = icon ?? (href ? <ExternalLink size={12} aria-hidden /> : null);
  const body = (
    <>
      {glyph}
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
