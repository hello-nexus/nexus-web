import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { TextInput } from '../../common/TextInput/TextInput';
import { useToast } from '../../common/Toast/Toast';
import { SensorPicker, useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import {
  getGlacialState,
  setGlacialSettings,
  type GlacialMode,
  type GlacialSettingsPatch,
  type GlacialSlotState,
  type GlacialState,
  GLACIAL_STATE_CHANGED_EVENT,
} from '../../../api/asus-glacial-lcd';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { AsusGlacialPanelTuning } from './AsusGlacialPanelTuning';
import { useReportDeviceWaiting } from './deviceDetecting';
import { GLACIAL_LABEL_MAX_BYTES, truncateUtf8 } from './asusGlacialLcdUtils';
import styles from './LianLiDevicePage.module.scss';

const POLL_MS = 3000;
const MODES: readonly GlacialMode[] = ['monitor', 'animated', 'static', 'panel'];
const MODE_KEYS: Record<GlacialMode, string> = {
  monitor: 'devices.asus-glacial-lcd.modeMonitor',
  animated: 'devices.asus-glacial-lcd.modeAnimation',
  static: 'devices.asus-glacial-lcd.modePicture',
  panel: 'devices.asus-glacial-lcd.modePanel',
};
const SLOT_COUNTS = [1, 2, 3] as const;
// The service starts this animation when the display is turned on before any mode was chosen.
const FIRST_RUN_ANIMATION = 1;
const truncateUtf8ToLabelLimit = (v: string) => truncateUtf8(v, GLACIAL_LABEL_MAX_BYTES);
const DEFAULT_CATEGORY = 'cpu';

/** The Glacial display controls, shared by its own page and the streamed panel page. */
export function AsusGlacialLcdControls() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { numberFormat } = useUnitPrefs();
  const lookup = useSensorLookup();
  const [state, setState] = useState<GlacialState | null>(null);
  useReportDeviceWaiting(state === null || !state.isConnected);
  const aliveRef = useRef(true);
  // Writes in flight: a poll landing meanwhile would snap a control back.
  const busyRef = useRef(0);

  const refresh = useCallback(async () => {
    if (busyRef.current > 0) return;
    const next = await getGlacialState();
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

  const commit = useCallback(async (patch: GlacialSettingsPatch) => {
    busyRef.current += 1;
    let ok = false;
    try {
      ok = await setGlacialSettings(patch);
    } catch {
      ok = false;
    } finally {
      busyRef.current -= 1;
    }
    if (!ok) push({ title: t('devices.asus-glacial-lcd.failedTitle'), body: t('devices.asus-glacial-lcd.failedBody') });
    const next = await getGlacialState();
    if (aliveRef.current && next !== null && busyRef.current === 0) setState(next);
    window.dispatchEvent(new Event(GLACIAL_STATE_CHANGED_EVENT));
  }, [push, t]);

  const edit = useCallback((local: Partial<GlacialState>, patch: GlacialSettingsPatch) => {
    setState(prev => prev && { ...prev, ...local });
    void commit(patch);
  }, [commit]);

  const ready = state !== null && state.isConnected;
  const chosen = state?.modeChosen === true;
  const mode = state?.mode ?? 'monitor';
  const assets = mode === 'static' ? state?.staticAssets ?? [] : state?.animatedAssets ?? [];
  const activeAsset = mode === 'static' ? state?.staticAsset : state?.animatedAsset;
  const assetKey = mode === 'static' ? 'devices.asus-glacial-lcd.pictureN' : 'devices.asus-glacial-lcd.animationN';

  const sensorName = (slot: GlacialSlotState) => {
    const picked = slot.sensor !== '';
    return lookup.resolve(picked ? slot.category : slot.resolvedCategory, picked ? slot.sensor : slot.resolvedSensor)?.name ?? '';
  };

  const setLabel = (index: number, typed: string, defaultName: string) => {
    if (!state) return;
    const label = typed === defaultName ? '' : typed;
    if (label === state.slots[index].label) return;
    const slots: GlacialSlotState[] = state.slots.map((s, i) => (i === index ? { ...s, label } : s));
    edit({ slots }, { slots: slots.map(({ category, sensor, label: l }) => ({ category, sensor, label: l })) });
  };

  const setSlot = (index: number, category: string, sensor: string) => {
    if (!state) return;
    const slots: GlacialSlotState[] = state.slots.map((s, i) => (i === index ? { ...s, category, sensor, label: '' } : s));
    edit({ slots }, { slots: slots.map(({ category: c, sensor: n, label }) => ({ category: c, sensor: n, label })) });
  };

  return (
    <>
    <SettingsSection title={t('devices.asus-glacial-lcd.displaySection')} boxClassName={styles.sectionBox}>
      <SettingToggle
        label={t('devices.asus-glacial-lcd.displayOn')}
        checked={state?.displayOn ?? false}
        disabled={!ready}
        onChange={on => edit(
          on && !chosen ? { displayOn: on, mode: 'animated', animatedAsset: FIRST_RUN_ANIMATION, modeChosen: true } : { displayOn: on },
          { displayOn: on },
        )}
      />
      <SettingToggle
        label={t('devices.asus-glacial-lcd.stayOn')}
        description={t('devices.asus-glacial-lcd.stayOnHint')}
        checked={state?.stayOnWhileAsleep ?? false}
        disabled={!ready}
        onChange={on => edit({ stayOnWhileAsleep: on }, { stayOnWhileAsleep: on })}
      />
      <SettingSlider
        editable
        trackFill
        label={t('devices.asus-glacial-lcd.brightness')}
        ariaLabel={t('devices.asus-glacial-lcd.brightnessAria')}
        value={state?.brightness ?? 0}
        min={0}
        max={100}
        step={1}
        formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
        disabled={!ready}
        onChange={(v: number) => setState(prev => prev && { ...prev, brightness: v })}
        onCommit={v => { void commit({ brightness: v }); }}
      />
    </SettingsSection>

    <SettingsSection title={t('devices.asus-glacial-lcd.contentSection')} boxClassName={styles.sectionBox}>
      <SettingRow label={t('devices.asus-glacial-lcd.mode')}>
        <ChipGroup
          ariaLabel={t('devices.asus-glacial-lcd.mode')}
          activeKey={chosen ? mode : ''}
          options={MODES.filter(m => m !== 'panel' || state?.panelModeAvailable === true).map(m => ({ key: m, label: t(MODE_KEYS[m]), disabled: !ready }))}
          onChange={key => edit({ mode: key as GlacialMode, modeChosen: true }, { mode: key as GlacialMode })}
        />
      </SettingRow>

      {chosen && (mode === 'static' || mode === 'animated') && (
        <SettingSelect
          label={t(mode === 'static' ? 'devices.asus-glacial-lcd.picture' : 'devices.asus-glacial-lcd.animation')}
          value={String(activeAsset ?? '')}
          options={assets.map((id, i) => ({ value: String(id), label: t(assetKey, { n: i + 1 }) }))}
          disabled={!ready}
          onChange={v => {
            const id = Number(v);
            if (mode === 'static') edit({ staticAsset: id }, { staticAsset: id });
            else edit({ animatedAsset: id }, { animatedAsset: id });
          }}
        />
      )}

      {chosen && mode === 'monitor' && state && (
        <>
          <SettingRow label={t('devices.asus-glacial-lcd.widgetCount')}>
            <ChipGroup
              ariaLabel={t('devices.asus-glacial-lcd.widgetCount')}
              activeKey={String(state.slotCount)}
              options={SLOT_COUNTS.map(n => ({ key: String(n), label: localizeNumbers(String(n), numberFormat), disabled: !ready }))}
              onChange={key => edit({ slotCount: Number(key) }, { slotCount: Number(key) })}
            />
          </SettingRow>
          {state.slots.slice(0, state.slotCount).map((slot, i) => (
            <Fragment key={i}>
            <SettingRow label={t('devices.asus-glacial-lcd.widgetN', { n: i + 1 })}>
              <SensorPicker
                lookup={lookup}
                category={(slot.sensor ? slot.category : slot.resolvedCategory) || DEFAULT_CATEGORY}
                sensor={slot.sensor || slot.resolvedSensor}
                disabled={!ready}
                onChange={sel => setSlot(i, sel.category, sel.sensor)}
              />
            </SettingRow>
            <SettingRow key={`label-${i}`} label={t('devices.asus-glacial-lcd.widgetLabel', { n: i + 1 })}>
              <TextInput
                size="sm"
                ariaLabel={t('devices.asus-glacial-lcd.widgetLabel', { n: i + 1 })}
                value={slot.label || sensorName(slot)}
                disabled={!ready}
                sanitize={truncateUtf8ToLabelLimit}
                onSubmit={v => setLabel(i, v, sensorName(slot))}
                onBlur={v => setLabel(i, v, sensorName(slot))}
              />
            </SettingRow>
            </Fragment>
          ))}
        </>
      )}
    </SettingsSection>
    {chosen && mode === 'panel' && state?.panelModeAvailable === true && <AsusGlacialPanelTuning />}
    </>
  );
}

export function AsusGlacialLcdDevicePage() {
  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="ROG Crosshair X870E Glacial"
      />
      <div className={`${styles.pageBody} pageBody`}>
        <AsusGlacialLcdControls />
      </div>
    </div>
  );
}
