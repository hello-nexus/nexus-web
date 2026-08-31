import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getCorsairLcdState,
  setCorsairLcd,
  type CorsairLcdPatch,
  type CorsairLcdState,
} from '../../../api/corsair-lcd';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

// Matches the Kraken's cadence so the readout tracks the cooler without adding load.
const STATE_POLL_MS = 1000;

// The firmware rotates whatever it renders, streamed frames included, so a pump mounted
// a quarter turn out is fixed here rather than in the panel layout. The wire value is the
// quarter-turn index (OpenLinkHub's lcdRotation), not the angle.
const LCD_ROTATIONS = [
  { value: 0, degrees: 0 },
  { value: 1, degrees: 90 },
  { value: 2, degrees: 180 },
  { value: 3, degrees: 270 },
];

/**
 * Hardware options for the iCUE LINK cooler's LCD module. Hosted by the LCD panel page's
 * settings tab: the glass is the panel, the screen module around it is this tab.
 */
export function CorsairLcdSettings() {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [state, setState] = useState<CorsairLcdState | null>(null);
  const aliveRef = useRef(true);
  // Set while the brightness thumb is being dragged, so the poll below keeps the local
  // value instead of snapping it back to whatever the service last reported.
  const brightnessDirtyRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getCorsairLcdState();
    if (!aliveRef.current || s === null) return;
    setState(prev => (prev && brightnessDirtyRef.current
      ? { ...s, brightness: prev.brightness }
      : s));
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refresh(); }, STATE_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  const commit = useCallback(async (patch: CorsairLcdPatch) => {
    await setCorsairLcd(patch);
    await refresh();
  }, [refresh]);

  // The state route answers 200 with hasDevice:false when the screen module is not
  // attached; without this the controls look live and every write is silently dropped.
  const loaded = state !== null && state.hasDevice;

  return (
    <SettingsSection title={t('devices.corsair.screenSection')} boxClassName={styles.sectionBox}>
      <SettingSlider
        editable
        trackFill
        label={t('devices.corsair.screenBrightness')}
        value={state?.brightness ?? 0}
        min={0}
        max={100}
        step={1}
        formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
        ariaLabel={t('devices.corsair.screenBrightnessAria')}
        disabled={!loaded}
        onChange={(v: number, commitNow?: boolean) => {
          if (!state) return;
          brightnessDirtyRef.current = true;
          setState({ ...state, brightness: v });
          if (commitNow) void commit({ brightness: v }).finally(() => { brightnessDirtyRef.current = false; });
        }}
        onCommit={(v: number) => {
          void commit({ brightness: v }).finally(() => { brightnessDirtyRef.current = false; });
        }}
      />

      <SettingSelect
        label={t('devices.corsair.screenRotation')}
        value={String(state?.rotation ?? 0)}
        onChange={v => { void commit({ rotation: Number(v) }); }}
        options={LCD_ROTATIONS.map(r => ({
          value: String(r.value),
          label: localizeNumbers(`${r.degrees}°`, numberFormat),
        }))}
        disabled={!loaded}
      />
    </SettingsSection>
  );
}
