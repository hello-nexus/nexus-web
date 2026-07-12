import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useSupportedDevices, type SupportedSource } from '../../../hooks/useSupportedDevices';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { SupportedDevicesList } from '../SupportedDevicesList/SupportedDevicesList';
import { SearchInput } from '../SearchInput/SearchInput';
import styles from './SupportedDevicesModal.module.scss';

interface SupportedDevicesModalProps {
  open: boolean;
  onClose: () => void;
  /** Which catalog to show - "peripherals" (default) or "all" (peripherals + lighting) */
  source?: SupportedSource;
  /** VID/PID of currently-detected devices - highlighted in the list */
  detectedVidPids?: Set<string>;
  /** Filter the catalog by category - e.g. "mouse","keyboard" */
  categoryFilter?: string[];
  /** Title override; defaults to "Supported Devices" */
  title?: string;
}

const PAGE_SIZE = 80;

export function SupportedDevicesModal({
  open,
  onClose,
  source = 'peripherals',
  detectedVidPids,
  categoryFilter,
  title,
}: SupportedDevicesModalProps) {
  const { t } = useTranslation();
  const { devices, loading } = useSupportedDevices(open, source);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const handleClose = useCallback(() => {
    setQuery('');
    setPage(0);
    onClose();
  }, [onClose]);

  const filtered = useMemo(() => {
    let list = devices;
    if (categoryFilter && categoryFilter.length > 0) {
      list = list.filter(d => categoryFilter.includes(d.category));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(d =>
        d.vendor.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        `${d.vendor} ${d.model}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [devices, query, categoryFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const current = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <DeviceModal open={open} onClose={handleClose} fullscreen title={title ?? t('supported.title')}>
      <div className={styles.content}>
        <div className={styles.searchRow}>
          <SearchInput
            value={query}
            onChange={v => { setQuery(v); setPage(0); }}
            placeholder={t('supported.searchPlaceholder')}
            autoFocus
            className={styles.search}
          />
          <span className={styles.count}>
            {loading ? t('supported.loading') : t('supported.countN', { n: String(filtered.length) })}
          </span>
        </div>

        <div className={styles.tableWrap}>
          {current.length === 0 && !loading ? (
            <div className={styles.empty}>{t('supported.empty')}</div>
          ) : (
            <SupportedDevicesList devices={current} detectedVidPids={detectedVidPids} />
          )}
        </div>

        {pageCount > 1 && (
          <div className={styles.pagination}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>
              {t('supported.prev')}
            </button>
            <span className={styles.pageLabel}>{t('supported.pageOf', { n: String(safePage + 1), total: String(pageCount) })}</span>
            <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>
              {t('supported.next')}
            </button>
          </div>
        )}
      </div>
    </DeviceModal>
  );
}
