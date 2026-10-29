import { ExternalLink } from 'lucide-react';
import classNames from 'classnames';
import styles from './TroubleshootLink.module.scss';

interface TroubleshootLinkProps {
  label: string;
  /** Opens this URL in a new tab. Without it the link is a button that calls `onClick`. */
  href?: string;
  onClick?: () => void;
  className?: string;
}

/** The dim "Troubleshooting" text link with the external-link glyph: an outside help page, or an in-app fix flow. */
export function TroubleshootLink({ label, href, onClick, className }: TroubleshootLinkProps) {
  const body = (
    <>
      <ExternalLink size={12} aria-hidden />
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
