import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useSupportedDevices, type SupportedSource } from '../../../hooks/useSupportedDevices';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { SupportedDevicesList } from '../SupportedDevicesList/SupportedDevicesList';
import { SupportedBrands } from '../SupportedBrands/SupportedBrands';
import { SupportedDevicesPager, SUPPORTED_DEVICES_PAGE_SIZE as PAGE_SIZE } from '../SupportedDevicesPager/SupportedDevicesPager';
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
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      list = list.filter(d => {
        // The newline keeps a word from matching across vendor and model.
        const text = `${d.vendor}\n${d.model}`.toLowerCase();
        return words.every(w => text.includes(w));
      });
    }
    return list;
  }, [devices, query, categoryFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const current = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <DeviceModal open={open} onClose={handleClose} fullscreen title={title ?? t('supported.title')}>
      <div className={styles.content}>
        <SupportedBrands className={styles.brands} query={query} onSelect={brand => { setQuery(brand); setPage(0); }} />
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
          <SupportedDevicesPager
            page={safePage}
            pageCount={pageCount}
            onPrev={() => setPage(p => Math.max(0, p - 1))}
            onNext={() => setPage(p => Math.min(pageCount - 1, p + 1))}
          />
        )}
      </div>
    </DeviceModal>
  );
}
