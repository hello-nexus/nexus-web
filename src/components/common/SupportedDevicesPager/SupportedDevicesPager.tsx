import { useTranslation } from '../../../lib/i18n';
import styles from './SupportedDevicesPager.module.scss';

export const SUPPORTED_DEVICES_PAGE_SIZE = 80;

interface SupportedDevicesPagerProps {
  /** Zero-based. */
  page: number;
  pageCount: number;
  /** Omitted for build-time HTML, where the host page wires the buttons itself. */
  onPrev?: () => void;
  onNext?: () => void;
}

/** Prev / "Page X of Y" / Next row under the Supported Devices table. */
export function SupportedDevicesPager({ page, pageCount, onPrev, onNext }: SupportedDevicesPagerProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.pagination}>
      <button onClick={onPrev} disabled={page === 0}>
        {t('supported.prev')}
      </button>
      <span className={styles.pageLabel}>{t('supported.pageOf', { n: String(page + 1), total: String(pageCount) })}</span>
      <button onClick={onNext} disabled={page >= pageCount - 1}>
        {t('supported.next')}
      </button>
    </div>
  );
}
