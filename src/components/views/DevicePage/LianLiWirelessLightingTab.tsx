import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { LightingPageSwitch } from './LightingPageSwitch';
import {
  getLianLiWirelessLighting,
  setLianLiWirelessChainLighting,
  type LianLiWirelessChainLighting,
  type LianLiWirelessChainPatch,
  type LianLiWirelessLane,
  type LianLiWirelessLighting,
} from '../../../api/lianli-wireless';
import { fanTypeKey } from './LianLiWirelessFansTab';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

const PERCENT_PER_LEVEL = 25;
const MODE_CUSTOM = 'custom';
const MODE_PER_LANE = 'perLane';
const DEFAULT_LANE_MODE = 'rainbow';
const DEFAULT_EFFECT = 'rainbow';
// The palette the service renders with when a chain has no user colours.
const DEFAULT_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];

type Translate = ReturnType<typeof useTranslation>['t'];

function effectLabel(t: Translate, key: string): string {
  return t(`devices.lianliEffect.${key}` as Parameters<Translate>[0]);
}

function chainTitle(t: Translate, chain: LianLiWirelessChainLighting): string {
  return chain.kind === 'strimer'
    ? chain.model
    : t(`devices.lianli-wireless.${fanTypeKey(chain.fanType)}` as Parameters<Translate>[0]);
}

function lanesOf(chain: LianLiWirelessChainLighting): LianLiWirelessLane[] {
  return Array.from({ length: chain.lanes }, (_, i) => chain.laneSettings[i] ?? {
    mode: DEFAULT_LANE_MODE,
    direction: 0,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  });
}

interface LianLiWirelessLightingTabProps {
  onSectionNavigate?: (section: string) => void;
}

/** Per-chain animation picker for the Strimer cables and fan chains bound to the controller. */
export function LianLiWirelessLightingTab({ onSectionNavigate }: LianLiWirelessLightingTabProps) {
  const [data, setData] = useState<LianLiWirelessLighting | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const d = await getLianLiWirelessLighting();
    if (aliveRef.current && d) setData(d);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const preview = useCallback((mac: string, patch: LianLiWirelessChainPatch) => {
    setData(prev => prev && {
      ...prev,
      chains: prev.chains.map(c => (c.mac === mac ? { ...c, ...patch } : c)),
    });
  }, []);

  const commit = useCallback(async (mac: string, patch: LianLiWirelessChainPatch) => {
    preview(mac, patch);
    // effectMode is derived by the service; it only feeds the preview.
    if (!await setLianLiWirelessChainLighting(mac, { ...patch, effectMode: undefined })) void refresh();
  }, [preview, refresh]);

  if (!data) return null;
  return (
    <>
      {data.chains.map(chain => (
        <ChainSection
          key={chain.mac}
          chain={chain}
          laneModes={data.laneModes}
          onPreview={patch => preview(chain.mac, patch)}
          onCommit={patch => { void commit(chain.mac, patch); }}
          onSectionNavigate={onSectionNavigate}
        />
      ))}
    </>
  );
}

interface ChainSectionProps {
  chain: LianLiWirelessChainLighting;
  laneModes: string[];
  onPreview: (patch: LianLiWirelessChainPatch) => void;
  onCommit: (patch: LianLiWirelessChainPatch) => void;
  onSectionNavigate?: (section: string) => void;
}

function ChainSection({ chain, laneModes, onPreview, onCommit, onSectionNavigate }: ChainSectionProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const lightingPage = chain.mode === MODE_CUSTOM;
  // The animation the chain plays when the Lighting page is not driving it.
  const effectKey = lightingPage ? chain.effectMode ?? DEFAULT_EFFECT : chain.mode;
  const effect = chain.modes.find(e => e.key === effectKey) ?? null;
  const perLane = chain.supportsPerLane && effectKey === MODE_PER_LANE;

  const modeOptions = [
    ...chain.modes.map(e => ({ value: e.key, label: effectLabel(t, e.key) })),
    ...(chain.supportsPerLane ? [{ value: MODE_PER_LANE, label: t('devices.lianli-wireless.strimerModePerLane') }] : []),
  ];
  const directionOptions = [
    { value: '0', label: t('devices.lianli.directionLtr') },
    { value: '1', label: t('devices.lianli.directionRtl') },
  ];
  const percent = (v: number) => localizeNumbers(`${v}%`, numberFormat);

  // The palette is a fixed set of slots; an effect reads its first colorsMax.
  const palette = DEFAULT_COLORS.map((fallback, i) => chain.colors[i] ?? fallback);
  const setColor = (i: number, hex: string, commit: boolean) => {
    const next = [...palette];
    next[i] = hex;
    (commit ? onCommit : onPreview)({ colors: next });
  };

  const lanes = lanesOf(chain);
  const setLane = (i: number, lane: Partial<LianLiWirelessLane>, commit: boolean) => {
    const next = lanes.map((l, idx) => (idx === i ? { ...l, ...lane } : l));
    (commit ? onCommit : onPreview)({ laneSettings: next });
  };

  return (
    <SettingsSection title={chainTitle(t, chain)} boxClassName={styles.sectionBox}>
      <LightingPageSwitch
        on={lightingPage}
        onChange={on => onCommit(on ? { mode: MODE_CUSTOM } : { mode: effectKey, effectMode: effectKey })}
        onSectionNavigate={onSectionNavigate}
      />

      <SettingSelect
        label={t('devices.lianli.lightingMode')}
        value={effectKey}
        onChange={v => onCommit({ mode: v, effectMode: v })}
        options={modeOptions}
        disabled={lightingPage}
      />

      <SettingSlider
        editable
        trackFill
        label={t('devices.lianli.lightingBrightness')}
        value={chain.brightness * PERCENT_PER_LEVEL}
        min={0}
        max={100}
        step={PERCENT_PER_LEVEL}
        formatValue={percent}
        ariaLabel={t('devices.lianli.lightingBrightnessAria')}
        disabled={lightingPage}
        onChange={(v: number, commit?: boolean) => {
          const level = Math.round(v / PERCENT_PER_LEVEL);
          (commit ? onCommit : onPreview)({ brightness: level });
        }}
        onCommit={(v: number) => onCommit({ brightness: Math.round(v / PERCENT_PER_LEVEL) })}
      />

      {(perLane || effect?.hasSpeed) && (
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli.lightingSpeed')}
          value={chain.speed * PERCENT_PER_LEVEL}
          min={0}
          max={100}
          step={PERCENT_PER_LEVEL}
          formatValue={percent}
          ariaLabel={t('devices.lianli.lightingSpeedAria')}
          disabled={lightingPage}
          onChange={(v: number, commit?: boolean) => {
            const level = Math.round(v / PERCENT_PER_LEVEL);
            (commit ? onCommit : onPreview)({ speed: level });
          }}
          onCommit={(v: number) => onCommit({ speed: Math.round(v / PERCENT_PER_LEVEL) })}
        />
      )}

      {effect?.hasDirection && (
        <SettingSelect
          label={t('devices.lianli.lightingDirection')}
          value={String(chain.direction)}
          onChange={v => onCommit({ direction: Number(v) })}
          options={directionOptions}
          disabled={lightingPage}
        />
      )}

      {effect && effect.colorsMax > 0 && (
        <div className={`${styles.colorBlock} ${lightingPage ? styles.rowDisabled : ''}`} data-settings-aside="true">
          <div className={styles.colorPairRow}>
            {palette.slice(0, effect.colorsMax).map((color, i) => (
              <div key={i} className={styles.colorEntry}>
                <span className={styles.colorLabel}>{t('devices.lianli.colorN', { n: i + 1 })}</span>
                <HsvPicker
                  value={color}
                  onPreview={(hex: string) => setColor(i, hex, false)}
                  onCommit={(hex: string) => setColor(i, hex, true)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {perLane && lanes.map((lane, i) => (
        <div key={i} className={`${styles.colorBlock} ${lightingPage ? styles.rowDisabled : ''}`} data-settings-aside="true">
          <SettingSelect
            label={t('devices.lianli-wireless.strimerLaneN', { n: i + 1 })}
            value={lane.mode}
            onChange={v => setLane(i, { mode: v }, true)}
            options={laneModes.map(key => ({ value: key, label: effectLabel(t, key) }))}
            disabled={lightingPage}
          />
          <SettingSelect
            label={t('devices.lianli.lightingDirection')}
            value={String(lane.direction)}
            onChange={v => setLane(i, { direction: Number(v) }, true)}
            options={directionOptions}
            disabled={lightingPage}
          />
          <HsvPicker
            value={lane.color}
            onPreview={(hex: string) => setLane(i, { color: hex }, false)}
            onCommit={(hex: string) => setLane(i, { color: hex }, true)}
          />
        </div>
      ))}
    </SettingsSection>
  );
}
