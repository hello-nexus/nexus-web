import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { ConfirmDialog } from '../../ConfirmDialog/ConfirmDialog';
import { DatePicker } from '../../DatePicker/DatePicker';
import { DevicePopup } from '../../DevicePopup/DevicePopup';
import { Toggle } from '../../Toggle/Toggle';
import {
  deleteScreenTimeAll,
  deleteScreenTimeDay,
  deleteScreenTimeRange,
  getTrackingStatus,
  setTrackingEnabled,
} from '../../../hooks/useScreenTimeBrowse';
import styles from './ScreenTimeDataControl.module.scss';

type Range = 'today' | 'week' | 'month' | 'custom' | 'all';

interface ScreenTimeDataControlProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function ScreenTimeDataControl({ open, onClose, onChanged }: ScreenTimeDataControlProps) {
  const { t } = useTranslation();
  const [tracking, setTracking] = useState(true);
  const [range, setRange] = useState<Range>('today');
  const today = todayIso();
  const [customFrom, setCustomFrom] = useState(addDays(today, -7));
  const [customTo, setCustomTo] = useState(today);
  const [confirm, setConfirm] = useState<{ open: boolean; from?: string; to?: string; all?: boolean }>({ open: false });
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getTrackingStatus().then(s => { if (s) setTracking(s.enabled); });
  }, [open]);

  const handleClose = () => {
    setResultMsg(null);
    onClose();
  };

  const onToggleTracking = async (enabled: boolean) => {
    setTracking(enabled);
    await setTrackingEnabled(enabled);
  };

  const requestClear = () => {
    if (range === 'today') {
      setConfirm({ open: true, from: today, to: today });
    } else if (range === 'week') {
      setConfirm({ open: true, from: addDays(today, -6), to: today });
    } else if (range === 'month') {
      setConfirm({ open: true, from: addDays(today, -29), to: today });
    } else if (range === 'custom') {
      if (customFrom <= customTo) setConfirm({ open: true, from: customFrom, to: customTo });
    } else {
      setConfirm({ open: true, all: true });
    }
  };

  const onConfirm = async () => {
    setBusy(true);
    let n = 0;
    if (confirm.all) {
      const r = await deleteScreenTimeAll();
      n = r?.deleted ?? 0;
    } else if (confirm.from && confirm.to) {
      if (confirm.from === confirm.to) {
        const r = await deleteScreenTimeDay(confirm.from);
        n = r?.deleted ?? 0;
      } else {
        const r = await deleteScreenTimeRange(confirm.from, confirm.to);
        n = r?.deleted ?? 0;
      }
    }
    setConfirm({ open: false });
    setResultMsg(t('settings.screentime.clearDone', { count: n }));
    setBusy(false);
    onChanged();
  };

  if (!open) return null;

  return (
    <>
      <DevicePopup open={open} onClose={handleClose} title={t('settings.screentime.title')}>
        <div className={styles.content}>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <div className={styles.toggleLabel}>{t('settings.screentime.tracking')}</div>
              <div className={styles.toggleDesc}>{t('settings.screentime.trackingDesc')}</div>
            </div>
            <Toggle
              checked={tracking}
              onChange={onToggleTracking}
              ariaLabel={t('settings.screentime.tracking')}
            />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>{t('settings.screentime.clearTitle')}</div>
            <div className={styles.radios}>
              {(['today', 'week', 'month', 'custom', 'all'] as Range[]).map(r => (
                <label key={r} className={styles.radio}>
                  <input type="radio" name="range" value={r}
                    checked={range === r} onChange={() => setRange(r)} />
                  <span>{t(`settings.screentime.clear${cap(r)}`)}</span>
                </label>
              ))}
            </div>
            {range === 'custom' && (
              <div className={styles.customRange}>
                <DatePicker value={customFrom} max={customTo} onChange={setCustomFrom} />
                <span>-</span>
                <DatePicker value={customTo} max={today} min={customFrom} onChange={setCustomTo} />
              </div>
            )}
          </div>

          {resultMsg && <div className={styles.resultMsg}>{resultMsg}</div>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>
              {t('confirm.cancel')}
            </button>
            <button type="button" className={styles.clearBtn}
              onClick={requestClear} disabled={busy}>
              {t('settings.screentime.clearButton')}
            </button>
          </div>
        </div>
      </DevicePopup>

      <ConfirmDialog
        open={confirm.open}
        title={t('settings.screentime.clearConfirmTitle')}
        message={confirm.all
          ? t('settings.screentime.clearConfirmAll')
          : t('settings.screentime.clearConfirmRange', { from: confirm.from ?? '', to: confirm.to ?? '' })}
        confirmLabel={t('settings.screentime.clearConfirmAction')}
        onConfirm={onConfirm}
        onCancel={() => setConfirm({ open: false })}
      />
    </>
  );
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
