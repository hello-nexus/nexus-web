import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { DatePicker } from '../../common/DatePicker/DatePicker';
import { deleteScreenTimeAll, deleteScreenTimeRange } from '../../../hooks/useScreenTimeBrowse';
import { deleteFpsAll, deleteFpsRange } from '../../../api/fps';
import { deleteMonitoringHistory } from '../../../api/monitoringHistory';
import { addDays, resolveClearDataRange, todayIso, type ClearDataPreset } from './clearDataRange';
import styles from './ClearDataModal.module.scss';

export type ClearDataScope = 'screenTime' | 'fps' | 'monitoringHistory';

interface ClearDataModalProps {
  scope: ClearDataScope;
  open: boolean;
  onClose: () => void;
  /** Fires once the delete request completes, with the server's reported count. */
  onCleared: (count: number) => void;
}

const TITLE_KEY: Record<ClearDataScope, string> = {
  screenTime: 'settings.localDataStore.clearDataModal.screenTimeTitle',
  fps: 'settings.localDataStore.clearDataModal.fpsTitle',
  monitoringHistory: 'settings.localDataStore.clearDataModal.monitoringHistoryTitle',
};

const PRESETS: ClearDataPreset[] = ['today', 'last7Days', 'last30Days', 'custom', 'allTime'];

const PRESET_LABEL_KEY: Record<ClearDataPreset, string> = {
  today: 'settings.localDataStore.clearDataModal.today',
  last7Days: 'settings.localDataStore.clearDataModal.last7Days',
  last30Days: 'settings.localDataStore.clearDataModal.last30Days',
  custom: 'settings.localDataStore.clearDataModal.custom',
  allTime: 'settings.localDataStore.clearDataModal.allTime',
};

/**
 * Every "Clear data" popup in Privacy & Data's Local data store section - one
 * shell, one shape, per scope only the title and the delete call differ.
 * The 7-day monitoring-history ring can't be range-deleted server-side, so
 * that scope skips the preset list entirely and clears all at once.
 */
export function ClearDataModal({ scope, open, onClose, onCleared }: ClearDataModalProps) {
  const { t } = useTranslation();
  const today = todayIso();
  const rangeSelectable = scope !== 'monitoringHistory';

  const [preset, setPreset] = useState<ClearDataPreset>('today');
  const [customFrom, setCustomFrom] = useState(addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    setPreset('today');
    setCustomFrom(addDays(today, -6));
    setCustomTo(today);
    setBusy(false);
  }, [open, today]);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const range = rangeSelectable
    ? resolveClearDataRange(preset, today, { from: customFrom, to: customTo })
    : null;
  const confirmDisabled = busy || (rangeSelectable && preset !== 'allTime' && range === null);

  const handleConfirm = async () => {
    if (confirmDisabled) return;
    setBusy(true);
    let result: { deleted: number } | null;
    if (scope === 'monitoringHistory') {
      result = await deleteMonitoringHistory();
    } else if (scope === 'screenTime') {
      result = range ? await deleteScreenTimeRange(range.from, range.to) : await deleteScreenTimeAll();
    } else {
      result = range ? await deleteFpsRange(range.from, range.to) : await deleteFpsAll();
    }
    // A cancel or an unmount elsewhere in the tree while the request was in
    // flight must not let this stale result close or toast a modal opened
    // for a different scope afterward.
    if (!mountedRef.current) return;
    setBusy(false);
    onCleared(result?.deleted ?? 0);
  };

  return (
    <ConfirmModal
      open={open}
      title={t(TITLE_KEY[scope])}
      message={rangeSelectable
        ? t('settings.localDataStore.clearDataModal.chooseRange')
        : t('settings.localDataStore.clearDataModal.monitoringHistoryHint')}
      note={t('settings.localDataStore.clearDataModal.cannotBeUndone')}
      // eslint-disable-next-line i18next/no-literal-string -- note tone enum value
      noteTone="danger"
      confirmLabel={t('settings.localDataStore.clearDataModal.confirmButton')}
      confirmDisabled={confirmDisabled}
      onConfirm={() => void handleConfirm()}
      onCancel={() => { if (!busy) onClose(); }}
    >
      {rangeSelectable && (
        <div
          className={styles.presets}
          role="radiogroup"
          aria-label={t('settings.localDataStore.clearDataModal.rangeLabel')}
        >
          {PRESETS.map(p => (
            <label key={p} className={styles.presetOption}>
              <input
                type="radio"
                name="clear-data-preset"
                value={p}
                checked={preset === p}
                onChange={() => setPreset(p)}
              />
              <span>{t(PRESET_LABEL_KEY[p])}</span>
            </label>
          ))}
        </div>
      )}
      {rangeSelectable && preset === 'custom' && (
        <div className={styles.customRange}>
          <label className={styles.customField}>
            <span>{t('settings.localDataStore.clearDataModal.customFrom')}</span>
            <DatePicker
              value={customFrom}
              max={customTo}
              onChange={setCustomFrom}
              ariaLabel={t('settings.localDataStore.clearDataModal.customFrom')}
            />
          </label>
          <label className={styles.customField}>
            <span>{t('settings.localDataStore.clearDataModal.customTo')}</span>
            <DatePicker
              value={customTo}
              max={today}
              min={customFrom}
              onChange={setCustomTo}
              ariaLabel={t('settings.localDataStore.clearDataModal.customTo')}
            />
          </label>
        </div>
      )}
    </ConfirmModal>
  );
}
