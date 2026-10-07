import { useCallback, useEffect, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { ColorPickerWithPresets } from '../../common/ColorPickerWithPresets/ColorPickerWithPresets';
import {
  getLianLiAioScreen,
  setLianLiAioScreen,
  type LianLiAioScreen,
  type LianLiAioScreenPatch,
} from '../../../api/lianli-wireless';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiWirelessDevicePage.module.scss';

const TEXT_COLOR_PRESETS = ['#FFFFFF', '#FF0000', '#FF8000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF'] as const;

type ReadingKey = 'showCpuTemp' | 'showCpuLoad' | 'showGpuTemp' | 'showGpuLoad' | 'showFanSpeed';
const CYCLE = 'cycle';
// Matches the service's AioLcdLoopIntervalMax.
const LOOP_INTERVAL_MAX = 60;
type ColorKey = 'labelColor' | 'valueColor' | 'unitColor';

/** The screen of one bound HydroShift II: theme, brightness, readings and colours, applied as they change. */
export function LianLiAioScreenSection({ mac }: { mac: string }) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [screen, setScreen] = useState<LianLiAioScreen | null>(null);

  useEffect(() => {
    let alive = true;
    void getLianLiAioScreen(mac).then(s => { if (alive) setScreen(s); });
    return () => { alive = false; };
  }, [mac]);

  // Optimistic: a refused save reloads what the service holds, keeping the shown values if that read fails too.
  const commit = useCallback(async (patch: LianLiAioScreenPatch) => {
    setScreen(prev => (prev ? { ...prev, ...patch } : prev));
    if (!await setLianLiAioScreen(mac, patch)) {
      const reloaded = await getLianLiAioScreen(mac);
      if (reloaded) setScreen(reloaded);
    }
  }, [mac]);

  if (!screen) return null;

  const readings: [ReadingKey, Parameters<typeof t>[0]][] = [
    ['showCpuTemp', 'devices.lianli-wireless.aioScreen.cpuTemp'],
    ['showCpuLoad', 'devices.lianli-wireless.aioScreen.cpuLoad'],
    ['showGpuTemp', 'devices.lianli-wireless.aioScreen.gpuTemp'],
    ['showGpuLoad', 'devices.lianli-wireless.aioScreen.gpuLoad'],
    ['showFanSpeed', 'devices.lianli-wireless.aioScreen.fanSpeed'],
  ];
  // The firmware rotates through every enabled reading, so one enabled reading is a fixed display.
  const enabled = readings.filter(([key]) => screen[key]).map(([key]) => key);
  const shows = enabled.length === 1 ? enabled[0] : CYCLE;
  const showsChange = (value: string) => {
    const patch: LianLiAioScreenPatch = {};
    for (const [key] of readings) patch[key] = value === CYCLE || key === value;
    void commit(patch);
  };
  const colors: [ColorKey, Parameters<typeof t>[0]][] = [
    ['labelColor', 'devices.lianli-wireless.aioScreen.labelColor'],
    ['valueColor', 'devices.lianli-wireless.aioScreen.valueColor'],
    ['unitColor', 'devices.lianli-wireless.aioScreen.unitColor'],
  ];

  return (
    <SettingsSection
      title={t('devices.lianli-wireless.aioScreen.title')}
      description={t('devices.lianli-wireless.aioScreen.hint')}
      boxClassName={styles.sectionBox}
    >
      <SettingSlider
        editable
        trackFill
        label={t('devices.lianli-wireless.aioScreen.brightness')}
        value={screen.brightness}
        min={0}
        max={100}
        step={5}
        formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
        // A typed value fires onChange and onCommit both, so only onCommit saves.
        onChange={(v: number) => setScreen(prev => (prev ? { ...prev, brightness: v } : prev))}
        onCommit={(v: number) => { void commit({ brightness: v }); }}
      />
      <SettingSelect
        label={t('devices.lianli-wireless.aioScreen.theme')}
        value={String(screen.theme)}
        onChange={v => { void commit({ theme: Number(v) }); }}
        options={Array.from({ length: screen.themeCount }, (_, i) => ({
          value: String(i),
          label: t('devices.lianli-wireless.aioScreen.themeN', { n: i + 1 }),
        }))}
      />
      <SettingSelect
        label={t('devices.lianli-wireless.aioScreen.shows')}
        value={shows}
        onChange={showsChange}
        options={[
          ...readings.map(([key, label]) => ({ value: key, label: t(label) })),
          { value: CYCLE, label: t('devices.lianli-wireless.aioScreen.cycle') },
        ]}
      />
      {shows === CYCLE && readings.map(([key, label]) => (
        <SettingToggle
          key={key}
          label={t(label)}
          checked={screen[key]}
          // Cycling needs two readings; dropping to one is the dropdown's job.
          disabled={screen[key] && enabled.length <= 2}
          onChange={on => { void commit({ [key]: on }); }}
        />
      ))}
      {shows === CYCLE && (
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli-wireless.aioScreen.interval')}
          value={screen.loopInterval}
          min={1}
          max={LOOP_INTERVAL_MAX}
          step={1}
          formatValue={v => localizeNumbers(t('devices.lianli-wireless.aioScreen.intervalValue', { n: v }), numberFormat)}
          onChange={(v: number) => setScreen(prev => (prev ? { ...prev, loopInterval: v } : prev))}
          onCommit={(v: number) => { void commit({ loopInterval: v }); }}
        />
      )}
      {colors.map(([key, label]) => (
        <SettingRow key={key} label={t(label)} stackOnNarrow>
          <ColorPickerWithPresets
            value={screen[key]}
            presets={TEXT_COLOR_PRESETS}
            allowCustom
            pickerPortal
            onCommit={hex => { void commit({ [key]: hex.toUpperCase() }); }}
          />
        </SettingRow>
      ))}
    </SettingsSection>
  );
}
