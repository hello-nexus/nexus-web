import { useEffect, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import styles from './PanelPageIndicator.module.scss';

interface PanelPageIndicatorProps {
  total: number;
  active: number;
  // Each time this token changes, the indicator un-fades for FADE_HOLD_MS
  // before fading back out. Caller bumps it on swipe / page change.
  visibilityToken?: number | string;
  className?: string;
  // Makes each dot a button that jumps to its page (a panel with no swipe). The
  // indicator then stays visible, since a fading target cannot be clicked.
  onSelect?: (index: number) => void;
}

const FADE_HOLD_MS = 1500;

export function PanelPageIndicator({ total, active, visibilityToken, className, onSelect }: PanelPageIndicatorProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (onSelect) return undefined;
    // Reset visibility on every token/page change to start a fresh fade cycle;
    // the timeout below fades it back out.
     
    setVisible(true);
    const handle = window.setTimeout(() => setVisible(false), FADE_HOLD_MS);
    return () => window.clearTimeout(handle);
  }, [visibilityToken, active, onSelect]);

  if (total <= 1) return null;

  return (
    <div
      className={`${styles.indicator}${className ? ` ${className}` : ''}`}
      data-fade={visible || onSelect ? undefined : 'true'}
      data-interactive={onSelect ? 'true' : undefined}
      data-panel-hit={onSelect ? 'true' : undefined}
      role="tablist"
      aria-label={t('panel.pages.label')}
    >
      {Array.from({ length: total }).map((_, idx) => (onSelect ? (
        <button
          key={idx}
          type="button"
          role="tab"
          className={styles.dot}
          data-active={idx === active ? 'true' : undefined}
          aria-selected={idx === active}
          aria-label={t('panel.pages.goTo', { page: idx + 1 })}
          onClick={() => onSelect(idx)}
        />
      ) : (
        <span
          key={idx}
          className={styles.dot}
          data-active={idx === active ? 'true' : undefined}
          aria-current={idx === active ? 'page' : undefined}
        />
      )))}
    </div>
  );
}
