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
}

const FADE_HOLD_MS = 1500;

export function PanelPageIndicator({ total, active, visibilityToken, className }: PanelPageIndicatorProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Reset visibility on every token/page change to start a fresh fade cycle;
    // the timeout below fades it back out.
     
    setVisible(true);
    const handle = window.setTimeout(() => setVisible(false), FADE_HOLD_MS);
    return () => window.clearTimeout(handle);
  }, [visibilityToken, active]);

  if (total <= 1) return null;

  return (
    <div
      className={`${styles.indicator}${className ? ` ${className}` : ''}`}
      data-fade={visible ? undefined : 'true'}
      role="tablist"
      aria-label={t('panel.pages.label')}
    >
      {Array.from({ length: total }).map((_, idx) => (
        <span
          key={idx}
          className={styles.dot}
          data-active={idx === active ? 'true' : undefined}
          aria-current={idx === active ? 'page' : undefined}
        />
      ))}
    </div>
  );
}
