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
type ColorKey = 'labelColor' | 'valueColor' | 'unitColor';

/** The screen of one bound HydroShift II: what it draws while Nexus drives the pump. */
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
      {readings.map(([key, label]) => (
        <SettingToggle
          key={key}
          label={t(label)}
          checked={screen[key]}
          onChange={on => { void commit({ [key]: on }); }}
        />
      ))}
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
