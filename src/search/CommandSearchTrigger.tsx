import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../lib/i18n';
import { useCommandPaletteOptional } from './CommandPaletteContext';
import { metaKeyLabel } from './platform';
import styles from './CommandSearchTrigger.module.scss';

const SEEN_KEY = 'nexus.search.seen.v1';

/**
 * The page-title "bar" rendered as a search affordance. Shows the current page
 * name (so location context is kept) with a search glyph and the ⌘K hint;
 * click or ⌘K opens the palette. A one-time accent ring nudges new users.
 *
 * Returns null when no palette provider is mounted — ViewHeader renders the
 * plain <h1> in that case (panel kiosk / iOS).
 */
export function CommandSearchTrigger({ pageTitle }: { pageTitle: string }) {
  const palette = useCommandPaletteOptional();
  const { t } = useTranslation();
  const metaKey = useMemo(() => metaKeyLabel(), []);
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem(SEEN_KEY)) setFirstRun(true); } catch { /* storage off */ }
  }, []);

  if (!palette) return null;

  const dismissFirstRun = () => {
    if (!firstRun) return;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage off */ }
    setFirstRun(false);
  };

  const onOpen = () => { dismissFirstRun(); palette.open(); };

  return (
    <button
      type="button"
      className={classNames(styles.trigger, { [styles.firstRun]: firstRun })}
      onClick={onOpen}
      aria-label={t('search.placeholder')}
      aria-keyshortcuts="Meta+K Control+K"
    >
      <Search size={15} className={styles.icon} aria-hidden />
      <span className={styles.label}>{pageTitle}</span>
      <span className={styles.spacer} />
      <span className={styles.kbd} aria-hidden>
        <kbd>{metaKey}</kbd><kbd>K</kbd>
      </span>
    </button>
  );
}
