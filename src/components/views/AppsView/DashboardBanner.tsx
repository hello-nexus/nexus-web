import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { Store, X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { dismissDashboardBanner, fetchDashboardBanner } from '../../../api/onboarding';
import styles from './DashboardBanner.module.scss';

// One banner per release. A closed banner stays closed until a release ships
// a new key, so change the key only when the banner changes.
export const DASHBOARD_BANNER_KEY = '3.0.19';

const COLUMNS = 8;

interface GridMetrics {
  cell: number;
  gap: number;
}

// The desktop grid sets its cell size and gap inline on the panel root at
// runtime, so the banner reads them there to span one row, COLUMNS wide.
function useGridMetrics(hostRef: RefObject<HTMLElement | null>, enabled: boolean): GridMetrics | null {
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host) return;
    let root: HTMLElement | null = null;
    const read = () => {
      if (!root) return;
      const style = getComputedStyle(root);
      const cell = Number.parseFloat(style.getPropertyValue('--panel-cell-size'));
      const gap = Number.parseFloat(style.getPropertyValue('--panel-gap'));
      if (!Number.isFinite(cell) || cell <= 0 || !Number.isFinite(gap)) return;
      setMetrics(prev => (prev && prev.cell === cell && prev.gap === gap ? prev : { cell, gap }));
    };
    const resize = new ResizeObserver(read);
    const rootStyle = new MutationObserver(read);
    // Watches for the root only until it mounts; after that only its own
    // size and inline style can change the metrics.
    const find = new MutationObserver(() => attach());
    const attach = () => {
      root = host.querySelector<HTMLElement>('[style*="--panel-cell-size"]');
      if (!root) return;
      find.disconnect();
      resize.observe(root);
      rootStyle.observe(root, { attributes: true, attributeFilter: ['style'] });
      read();
    };
    find.observe(host, { childList: true, subtree: true });
    attach();
    return () => {
      find.disconnect();
      resize.disconnect();
      rootStyle.disconnect();
    };
  }, [hostRef, enabled]);
  return metrics;
}

interface DashboardBannerProps {
  gridHostRef: RefObject<HTMLElement | null>;
  onOpen: () => void;
}

export function DashboardBanner({ gridHostRef, onOpen }: DashboardBannerProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const grid = useGridMetrics(gridHostRef, visible);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardBanner()
      .then(status => {
        if (!cancelled && status) setVisible(status.dismissedKey !== DASHBOARD_BANNER_KEY);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!visible || !grid) return null;

  const dismiss = () => {
    setVisible(false);
    void dismissDashboardBanner(DASHBOARD_BANNER_KEY).catch(() => {});
  };

  const sizing = {
    '--banner-width': `${grid.cell * COLUMNS + grid.gap * (COLUMNS - 1)}px`,
    '--banner-height': `${grid.cell}px`,
  } as CSSProperties;

  return (
    <div className={styles.banner} style={sizing}>
      <button
        type="button"
        className={styles.open}
        onClick={() => { dismiss(); onOpen(); }}
      >
        <span className={styles.icon} aria-hidden><Store size={22} /></span>
        <span className={styles.text}>
          <span className={styles.title}>{t('dashboard.banner.marketplace.title')}</span>
          <span className={styles.body}>{t('dashboard.banner.marketplace.body')}</span>
        </span>
        <span className={styles.cta}>{t('dashboard.banner.marketplace.open')}</span>
      </button>
      <button
        type="button"
        className={styles.close}
        aria-label={t('dashboard.banner.dismiss')}
        title={t('dashboard.banner.dismiss')}
        onClick={dismiss}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
