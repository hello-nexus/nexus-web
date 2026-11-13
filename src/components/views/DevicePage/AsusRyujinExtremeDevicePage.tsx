import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Slider } from '../../common/Slider/Slider';
import { useToast } from '../../common/Toast/Toast';
import {
  getRyujinDisplay,
  setRyujinDisplay,
  RYUJIN_MAX_BRIGHTNESS,
  RYUJIN_MIN_BRIGHTNESS,
  type RyujinDisplayPatch,
  type RyujinDisplayState,
  type RyujinRotation,
} from '../../../api/asus-ryujin-extreme';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useReportDeviceWaiting } from './deviceDetecting';
import styles from './LianLiDevicePage.module.scss';

const POLL_MS = 3000;
const ROTATIONS: readonly RyujinRotation[] = [0, 90];

/** The ROG Ryujin III Extreme page: the display settings its screen stores. Pump and fans live on the Cooling page. */
export function AsusRyujinExtremeDevicePage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { numberFormat } = useUnitPrefs();
  const [state, setState] = useState<RyujinDisplayState | null>(null);
  useReportDeviceWaiting(state === null || !state.isConnected);
  const aliveRef = useRef(true);
  // Writes in flight: a poll landing meanwhile would snap a control back.
  const busyRef = useRef(0);

  const refresh = useCallback(async () => {
    if (busyRef.current > 0) return;
    const next = await getRyujinDisplay();
    if (!aliveRef.current || next === null || busyRef.current > 0) return;
    setState(next);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const commit = useCallback(async (patch: RyujinDisplayPatch) => {
    busyRef.current += 1;
    let ok = false;
    try {
      ok = await setRyujinDisplay(patch);
    } catch {
      ok = false;
    } finally {
      busyRef.current -= 1;
    }
    if (!ok) push({ title: t('devices.asus-ryujin-extreme.failedTitle'), body: t('devices.asus-ryujin-extreme.failedBody') });
    const next = await getRyujinDisplay();
    if (aliveRef.current && next !== null && busyRef.current === 0) setState(next);
  }, [push, t]);

  const ready = state !== null && state.isConnected;

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
            label={t('devices.asus-ryujin-extreme.brightness')}
            ariaLabel={t('devices.asus-ryujin-extreme.brightnessAria')}
            value={state?.brightness ?? RYUJIN_MIN_BRIGHTNESS}
            min={RYUJIN_MIN_BRIGHTNESS}
            max={RYUJIN_MAX_BRIGHTNESS}
            step={1}
            formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
            disabled={!ready}
            onChange={v => setState(prev => prev && { ...prev, brightness: v })}
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
        </SettingsSection>
      </div>
    </div>
  );
}
