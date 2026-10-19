import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import {
  getLianLiFlexThermalAlert,
  setLianLiFlexThermalAlert,
  type LianLiFlexThermalAlert,
  type LianLiFlexThermalAlertPatch,
  type LianLiFlexThermalSource,
} from '../../../api/lianli-flex';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

const EDIT_GRACE_MS = 2500;
// The alert state is live, so it is read often.
const POLL_MS = 2000;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 110;

type SourceKey = 'cpu' | 'gpu';
const SOURCES: SourceKey[] = ['cpu', 'gpu'];
const WARN_TONE = 'warn' as const;

interface LianLiFlexThermalAlertSectionProps {
  /** Unit MACs with a display name, for choosing which fans alert. */
  units: { mac: string; title: string }[];
}

/**
 * Thermal alert: when the CPU or GPU passes its threshold the chosen fans turn
 * a solid color, and go back to their own lighting when it cools.
 */
export function LianLiFlexThermalAlertSection({ units }: LianLiFlexThermalAlertSectionProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [data, setData] = useState<LianLiFlexThermalAlert | null>(null);
  const aliveRef = useRef(true);
  const lastEditRef = useRef(Number.NEGATIVE_INFINITY);

  const refresh = useCallback(async () => {
    const d = await getLianLiFlexThermalAlert().catch(() => null);
    if (!aliveRef.current || !d) return;
    // During an edit grace only the live state moves, never the controls.
    if (performance.now() - lastEditRef.current > EDIT_GRACE_MS) setData(d);
    else setData(prev => (prev ? { ...prev, active: d.active } : d));
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const commit = useCallback(async (patch: LianLiFlexThermalAlertPatch) => {
    lastEditRef.current = performance.now();
    setData(prev => prev && {
      ...prev,
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.members ? { members: patch.members } : {}),
      ...(patch.cpu ? { cpu: { ...prev.cpu, ...patch.cpu } } : {}),
      ...(patch.gpu ? { gpu: { ...prev.gpu, ...patch.gpu } } : {}),
    });
    if (!await setLianLiFlexThermalAlert(patch).catch(() => false)) {
      lastEditRef.current = Number.NEGATIVE_INFINITY;
      void refresh();
    }
  }, [refresh]);

  const previewSource = (key: SourceKey, patch: Partial<LianLiFlexThermalSource>) =>
    setData(prev => prev && { ...prev, [key]: { ...prev[key], ...patch } });

  if (!data) return null;

  const sourceName = (key: SourceKey) => t(key === 'cpu' ? 'devices.lianli-flex.sourceCpu' : 'devices.lianli-flex.sourceGpu');
  const activeSource = data.active.source;
  const everyUnit = data.members.length === 0;
  const memberOn = (mac: string) => everyUnit || data.members.includes(mac);
  const toggleMember = (mac: string, on: boolean) => {
    const current = everyUnit ? units.map(u => u.mac) : data.members;
    const next = on ? [...current.filter(m => m !== mac), mac] : current.filter(m => m !== mac);
    // Every unit selected is stored as the empty list, which also covers a unit added later.
    void commit({ members: next.length === units.length ? [] : next });
  };

  const sourceRows = (key: SourceKey) => {
    const source = data[key];
    const off = !data.enabled || !source.enabled;
    return (
      <>
        <SettingToggle
          label={t('devices.lianli-flex.thermalSourceToggle', { source: sourceName(key) })}
          checked={source.enabled}
          disabled={!data.enabled}
          onChange={on => { void commit({ [key]: { enabled: on } }); }}
        />
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli-flex.thermalThreshold', { source: sourceName(key) })}
          value={source.threshold}
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          step={1}
          formatValue={v => localizeNumbers(`${v}°C`, numberFormat)}
          ariaLabel={t('devices.lianli-flex.thermalThreshold', { source: sourceName(key) })}
          disabled={off}
          onChange={(v: number, done?: boolean) => {
            const threshold = Math.round(v);
            if (done) void commit({ [key]: { threshold } });
            else previewSource(key, { threshold });
          }}
          onCommit={(v: number) => { void commit({ [key]: { threshold: Math.round(v) } }); }}
        />
      </>
    );
  };

  return (
    <SettingsSection title={t('devices.lianli-flex.thermalSection')} boxClassName={styles.sectionBox}>
      <SettingToggle
        label={t('devices.lianli-flex.thermalEnable')}
        description={t('devices.lianli-flex.thermalHint')}
        checked={data.enabled}
        onChange={on => { void commit({ enabled: on }); }}
      />
      <SettingRow
        label={t('devices.lianli-flex.thermalStatus')}
        state={activeSource
          ? { label: t('devices.lianli-flex.thermalActive', { source: sourceName(activeSource) }), tone: WARN_TONE }
          : { label: t('devices.lianli-flex.thermalIdle') }}
      />
      {sourceRows('cpu')}
      {sourceRows('gpu')}
      <div className={styles.colorBlock} data-settings-aside="true">
        <div className={styles.colorPairRow}>
          {SOURCES.map(key => {
            const off = !data.enabled || !data[key].enabled;
            return (
              <div key={key} className={`${styles.colorEntry} ${off ? styles.rowDisabled : ''}`}>
                <span className={styles.colorLabel}>{t('devices.lianli-flex.thermalColor', { source: sourceName(key) })}</span>
                <HsvPicker
                  value={data[key].color}
                  onPreview={(hex: string) => previewSource(key, { color: hex })}
                  onCommit={(hex: string) => { void commit({ [key]: { color: hex } }); }}
                />
              </div>
            );
          })}
        </div>
      </div>
      {units.length > 1 && units.map(unit => (
        <SettingToggle
          key={unit.mac}
          label={t('devices.lianli-flex.thermalMember', { fan: unit.title })}
          checked={memberOn(unit.mac)}
          disabled={!data.enabled}
          onChange={on => toggleMember(unit.mac, on)}
        />
      ))}
    </SettingsSection>
  );
}
