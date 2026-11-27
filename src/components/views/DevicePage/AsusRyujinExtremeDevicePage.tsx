import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Button } from '../../common/Button/Button';
import { FlashProgress } from '../../common/FlashProgress/FlashProgress';
import { SettingRow, SettingSelect } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Slider } from '../../common/Slider/Slider';
import { useToast } from '../../common/Toast/Toast';
import {
  getRyujinDisplay,
  setRyujinDisplay,
  uploadRyujinMedia,
  canUploadRyujinMedia,
  RYUJIN_MAX_BRIGHTNESS,
  RYUJIN_MIN_BRIGHTNESS,
  type RyujinDisplayPatch,
  type RyujinDisplayState,
  type RyujinRotation,
  type RyujinScreenMode,
  type RyujinSensorCount,
} from '../../../api/asus-ryujin-extreme';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useReportDeviceWaiting } from './deviceDetecting';
import styles from './LianLiDevicePage.module.scss';

const POLL_MS = 3000;
const UPLOAD_POLL_MS = 1000;
const AWAIT_UPLOAD_MS = 30000;
const FAILED_REASON_KEYS: Record<string, string> = {
  controlOff: 'devices.asus-ryujin-extreme.mediaReasonControlOff',
  bulkUnavailable: 'devices.asus-ryujin-extreme.mediaReasonBulkUnavailable',
  bulkInUse: 'devices.asus-ryujin-extreme.mediaReasonBulkInUse',
};
const SCREEN_MODES: readonly RyujinScreenMode[] = ['monitor', 'image'];
const STACKED = 'stacked' as const;
const ROTATIONS: readonly RyujinRotation[] = [0, 90];
const SENSOR_COUNTS: readonly RyujinSensorCount[] = [2, 3];
const SENSOR_LABEL_KEYS: Record<string, string> = {
  'cpu-temp': 'devices.asus-ryujin-extreme.sensor.cpuTemp',
  'gpu-temp': 'devices.asus-ryujin-extreme.sensor.gpuTemp',
  'liquid-temp': 'devices.asus-ryujin-extreme.sensor.liquidTemp',
  'pump-rpm': 'devices.asus-ryujin-extreme.sensor.pumpRpm',
  'fan-rpm': 'devices.asus-ryujin-extreme.sensor.fanRpm',
};

/** The ROG Ryujin III Extreme page: the display settings its screen stores. Pump and fans live on the Cooling page. */
export function AsusRyujinExtremeDevicePage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { numberFormat } = useUnitPrefs();
  const [state, setState] = useState<RyujinDisplayState | null>(null);
  useReportDeviceWaiting(state === null || !state.isConnected);
  // After a pick the service has not reported progress yet; the fast poll starts at once instead of waiting a slow cycle.
  const [awaitingUpload, setAwaitingUpload] = useState(false);
  // Fetch order, so a state read before the pick cannot end the wait for the new upload's first report.
  const seqRef = useRef(0);
  const stateSeqRef = useRef(0);
  const postSeqRef = useRef(0);
  const awaitTimerRef = useRef<number | undefined>(undefined);
  const [remoteNote, setRemoteNote] = useState(false);
  const sending = state?.uploadState === 'uploading' || awaitingUpload;
  const canUpload = canUploadRyujinMedia();
  const aliveRef = useRef(true);
  // Writes in flight: a poll landing meanwhile would snap a control back.
  const busyRef = useRef(0);
  // A brightness drag in progress: a poll landing before its final write would snap the knob back.
  const draggingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [converting, setConverting] = useState(false);

  const refresh = useCallback(async () => {
    if (busyRef.current > 0 || draggingRef.current) return;
    const seq = ++seqRef.current;
    const next = await getRyujinDisplay();
    if (!aliveRef.current || next === null || busyRef.current > 0 || draggingRef.current) return;
    stateSeqRef.current = seq;
    setState(next);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, sending ? UPLOAD_POLL_MS : POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh, sending]);

  useEffect(() => {
    if (awaitingUpload && state && state.uploadState !== 'idle' && stateSeqRef.current > postSeqRef.current) {
      window.clearTimeout(awaitTimerRef.current);
      setAwaitingUpload(false);
    }
  }, [awaitingUpload, state]);

  useEffect(() => () => window.clearTimeout(awaitTimerRef.current), []);

  const onPickFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setConverting(true);
    let result: { ok: boolean; msg: string } | null = null;
    try {
      result = await uploadRyujinMedia(file);
    } catch {
      result = null;
    } finally {
      if (aliveRef.current) setConverting(false);
    }
    if (result?.ok) {
      postSeqRef.current = ++seqRef.current;
      if (aliveRef.current) {
        setAwaitingUpload(true);
        window.clearTimeout(awaitTimerRef.current);
        awaitTimerRef.current = window.setTimeout(() => setAwaitingUpload(false), AWAIT_UPLOAD_MS);
      }
    } else {
      push({ title: t('devices.asus-ryujin-extreme.uploadFailedTitle'), body: result?.msg || t('devices.asus-ryujin-extreme.uploadFailedBody') });
    }
    const seq = ++seqRef.current;
    const next = await getRyujinDisplay();
    if (aliveRef.current && next !== null) {
      stateSeqRef.current = seq;
      setState(next);
    }
  }, [push, t]);

  const commit = useCallback(async (patch: RyujinDisplayPatch) => {
    busyRef.current += 1;
    draggingRef.current = false;
    let ok = false;
    try {
      ok = await setRyujinDisplay(patch);
    } catch {
      ok = false;
    } finally {
      busyRef.current -= 1;
    }
    if (!ok) push({ title: t('devices.asus-ryujin-extreme.failedTitle'), body: t('devices.asus-ryujin-extreme.failedBody') });
    const seq = ++seqRef.current;
    const next = await getRyujinDisplay();
    if (aliveRef.current && next !== null && busyRef.current === 0) {
      stateSeqRef.current = seq;
      setState(next);
    }
  }, [push, t]);

  const ready = state !== null && state.isConnected;
  const sensorCount = state?.sensorCount === 2 ? 2 : 3;
  const sensorOptions = (state?.availableSensors ?? [])
    .filter(id => id in SENSOR_LABEL_KEYS)
    .map(id => ({ value: id, label: t(SENSOR_LABEL_KEYS[id]) }));

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="ROG Ryujin III Extreme"
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection title={t('devices.asus-ryujin-extreme.displaySection')} boxClassName={styles.sectionBox}>
          <Slider
            editable
            trackFill
            orientation={STACKED}
            label={t('devices.asus-ryujin-extreme.brightness')}
            ariaLabel={t('devices.asus-ryujin-extreme.brightnessAria')}
            value={state?.brightness ?? RYUJIN_MIN_BRIGHTNESS}
            min={RYUJIN_MIN_BRIGHTNESS}
            max={RYUJIN_MAX_BRIGHTNESS}
            step={1}
            formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
            disabled={!ready}
            onChange={v => {
              draggingRef.current = true;
              setState(prev => prev && { ...prev, brightness: v });
            }}
            onCommit={v => { void commit({ brightness: v }); }}
          />
          <SettingRow label={t('devices.asus-ryujin-extreme.rotation')}>
            <ChipGroup
              ariaLabel={t('devices.asus-ryujin-extreme.rotation')}
              activeKey={String(state?.rotation ?? '')}
              options={ROTATIONS.map(r => ({
                key: String(r),
                label: t('devices.asus-ryujin-extreme.rotationDegrees', { n: localizeNumbers(String(r), numberFormat) }),
                disabled: !ready,
              }))}
              onChange={key => {
                const rotation = Number(key) as RyujinRotation;
                setState(prev => prev && { ...prev, rotation });
                void commit({ rotation });
              }}
            />
          </SettingRow>
          <SettingRow label={t('devices.asus-ryujin-extreme.screenMode')}>
            <ChipGroup
              ariaLabel={t('devices.asus-ryujin-extreme.screenMode')}
              activeKey={state?.screenMode ?? ''}
              options={SCREEN_MODES.map(mode => ({
                key: mode,
                label: t(mode === 'image' ? 'devices.asus-ryujin-extreme.screenModeImage' : 'devices.asus-ryujin-extreme.screenModeMonitor'),
                disabled: !ready || sending || converting,
              }))}
              onChange={key => {
                const screenMode = key as RyujinScreenMode;
                if (screenMode === 'image' && !state?.mediaName) {
                  if (!canUpload) {
                    setRemoteNote(true);
                    return;
                  }
                  fileRef.current?.click();
                  return;
                }
                setState(prev => prev && { ...prev, screenMode });
                void commit({ screenMode });
              }}
            />
          </SettingRow>
          {state?.screenMode === 'image' && (
            <div data-settings-aside="true">
              <Button size="sm" tone="neutral" disabled={!ready || sending || converting || !canUpload} onClick={() => fileRef.current?.click()}>
                {converting
                  ? t('devices.asus-ryujin-extreme.mediaConverting')
                  : t(state.mediaName ? 'devices.asus-ryujin-extreme.mediaReplace' : 'devices.asus-ryujin-extreme.mediaChoose')}
              </Button>
              {sending && (
                <FlashProgress
                  status={{
                    percent: state.uploadTotal > 0 ? Math.round((state.uploadSent / state.uploadTotal) * 100) : 0,
                    message: t('devices.asus-ryujin-extreme.mediaSending'),
                  }}
                />
              )}
              {!sending && state.mediaName && state.uploadState !== 'failed' && (
                <p className={styles.customNote}>
                  {t(state.mediaHeld ? 'devices.asus-ryujin-extreme.mediaStored' : 'devices.asus-ryujin-extreme.mediaWaiting', { name: state.mediaName })}
                </p>
              )}
              {state.uploadState === 'failed' && (
                <>
                  <p className={styles.customNote}>{t(FAILED_REASON_KEYS[state.uploadReason] ?? 'devices.asus-ryujin-extreme.mediaFailed')}</p>
                  {state.uploadMessage && (state.uploadReason === 'failed' || !FAILED_REASON_KEYS[state.uploadReason]) && (
                    <p className={styles.customNote}>{t('devices.asus-ryujin-extreme.mediaDetail', { msg: state.uploadMessage })}</p>
                  )}
                </>
              )}
              {!canUpload && (
                <p className={styles.customNote}>{t('devices.asus-ryujin-extreme.mediaRemote')}</p>
              )}
            </div>
          )}
          {!canUpload && remoteNote && state?.screenMode !== 'image' && (
            <p className={styles.customNote}>{t('devices.asus-ryujin-extreme.mediaRemote')}</p>
          )}
          <input ref={fileRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={e => { void onPickFile(e); }} />
          {state?.screenMode !== 'image' && (
            <SettingRow label={t('devices.asus-ryujin-extreme.readings')}>
              <ChipGroup
                ariaLabel={t('devices.asus-ryujin-extreme.readings')}
                activeKey={state ? String(sensorCount) : ''}
                options={SENSOR_COUNTS.map(n => ({
                  key: String(n),
                  label: localizeNumbers(String(n), numberFormat),
                  disabled: !ready,
                }))}
                onChange={key => {
                  const next = Number(key) as RyujinSensorCount;
                  setState(prev => prev && { ...prev, sensorCount: next });
                  void commit({ sensorCount: next });
                }}
              />
            </SettingRow>
          )}
          {state?.screenMode !== 'image' && Array.from({ length: sensorCount }, (_, i) => (
            <SettingSelect
              key={i}
              label={t('devices.asus-ryujin-extreme.reading', { n: localizeNumbers(String(i + 1), numberFormat) })}
              value={state?.slots[i] ?? ''}
              options={sensorOptions}
              disabled={!ready}
              onChange={id => {
                if (!state) return;
                const slots = state.slots.slice(0, 3);
                slots[i] = id;
                setState(prev => prev && { ...prev, slots });
                void commit({ slots });
              }}
            />
          ))}
        </SettingsSection>
      </div>
    </div>
  );
}
