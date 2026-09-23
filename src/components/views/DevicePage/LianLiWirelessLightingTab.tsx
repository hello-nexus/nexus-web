import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getLianLiWirelessStrimers,
  setLianLiWirelessStrimer,
  type LianLiWirelessStrimer,
  type LianLiWirelessStrimerEffect,
  type LianLiWirelessStrimerLane,
  type LianLiWirelessStrimerPatch,
  type LianLiWirelessStrimers,
} from '../../../api/lianli-wireless';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

const PERCENT_PER_LEVEL = 25;
const MODE_CUSTOM = 'custom';
const MODE_PER_LANE = 'perLane';
const DEFAULT_LANE_MODE = 'rainbow';
// The palette the service renders with when a cable has no user colours.
const STRIMER_DEFAULT_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];

type Translate = ReturnType<typeof useTranslation>['t'];

function effectLabel(t: Translate, key: string): string {
  return t(`devices.strimerEffect.${key}` as Parameters<Translate>[0]);
}

function lanesOf(strimer: LianLiWirelessStrimer): LianLiWirelessStrimerLane[] {
  return Array.from({ length: strimer.lanes }, (_, i) => strimer.laneSettings[i] ?? {
    mode: DEFAULT_LANE_MODE,
    direction: 0,
    color: STRIMER_DEFAULT_COLORS[i % STRIMER_DEFAULT_COLORS.length],
  });
}

interface LianLiWirelessLightingTabProps {
  onSectionNavigate?: (section: string) => void;
}

/** Per-cable animation picker for the Strimer Wireless cables bound to the dongle. */
export function LianLiWirelessLightingTab({ onSectionNavigate }: LianLiWirelessLightingTabProps) {
  const [data, setData] = useState<LianLiWirelessStrimers | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const d = await getLianLiWirelessStrimers();
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

  const preview = useCallback((mac: string, patch: LianLiWirelessStrimerPatch) => {
    setData(prev => prev && {
      ...prev,
      strimers: prev.strimers.map(s => (s.mac === mac ? { ...s, ...patch } : s)),
    });
  }, []);

  const commit = useCallback(async (mac: string, patch: LianLiWirelessStrimerPatch) => {
    preview(mac, patch);
    if (!await setLianLiWirelessStrimer(mac, patch)) void refresh();
  }, [preview, refresh]);

  if (!data) return null;
  return (
    <>
      {data.strimers.map(strimer => (
        <StrimerSection
          key={strimer.mac}
          strimer={strimer}
          effects={data.modes}
          laneModes={data.laneModes}
          onPreview={patch => preview(strimer.mac, patch)}
          onCommit={patch => { void commit(strimer.mac, patch); }}
          onSectionNavigate={onSectionNavigate}
        />
      ))}
    </>
  );
}

interface StrimerSectionProps {
  strimer: LianLiWirelessStrimer;
  effects: LianLiWirelessStrimerEffect[];
  laneModes: string[];
  onPreview: (patch: LianLiWirelessStrimerPatch) => void;
  onCommit: (patch: LianLiWirelessStrimerPatch) => void;
  onSectionNavigate?: (section: string) => void;
}

function StrimerSection({ strimer, effects, laneModes, onPreview, onCommit, onSectionNavigate }: StrimerSectionProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const effect = effects.find(e => e.key === strimer.mode) ?? null;
  const perLane = strimer.mode === MODE_PER_LANE;
  const custom = !perLane && effect === null;

  const modeOptions = [
    { value: MODE_CUSTOM, label: t('devices.lianli-wireless.strimerModeCustom') },
    ...effects.map(e => ({ value: e.key, label: effectLabel(t, e.key) })),
    { value: MODE_PER_LANE, label: t('devices.lianli-wireless.strimerModePerLane') },
  ];
  const directionOptions = [
    { value: '0', label: t('devices.lianli.directionLtr') },
    { value: '1', label: t('devices.lianli.directionRtl') },
  ];
  const percent = (v: number) => localizeNumbers(`${v}%`, numberFormat);

  // The cable's palette is a fixed set of slots; an effect reads its first colorsMax.
  const palette = STRIMER_DEFAULT_COLORS.map((fallback, i) => strimer.colors[i] ?? fallback);
  const setColor = (i: number, hex: string, commit: boolean) => {
    const next = [...palette];
    next[i] = hex;
    (commit ? onCommit : onPreview)({ colors: next });
  };

  const lanes = lanesOf(strimer);
  const setLane = (i: number, lane: Partial<LianLiWirelessStrimerLane>, commit: boolean) => {
    const next = lanes.map((l, idx) => (idx === i ? { ...l, ...lane } : l));
    (commit ? onCommit : onPreview)({ laneSettings: next });
  };

  return (
    <SettingsSection title={strimer.model} boxClassName={styles.sectionBox}>
      <SettingSelect
        label={t('devices.lianli.lightingMode')}
        value={custom ? MODE_CUSTOM : strimer.mode}
        onChange={v => onCommit({ mode: v })}
        options={modeOptions}
      />

      {custom ? (
        <>
          <p className={styles.customNote} data-settings-aside="true">{t('devices.lianli.customModeNote')}</p>
          {onSectionNavigate && (
            <Button
              className={styles.lightingLink}
              size="sm"
              tone="neutral"
              icon={<Lightbulb size={14} />}
              onClick={() => onSectionNavigate('lighting')}
            >
              {t('smartLights.colorOnLightingPage')}
            </Button>
          )}
        </>
      ) : (
        <>
          <SettingSlider
            editable
            trackFill
            label={t('devices.lianli.lightingBrightness')}
            value={strimer.brightness * PERCENT_PER_LEVEL}
            min={0}
            max={100}
            step={PERCENT_PER_LEVEL}
            formatValue={percent}
            ariaLabel={t('devices.lianli.lightingBrightnessAria')}
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
              value={strimer.speed * PERCENT_PER_LEVEL}
              min={0}
              max={100}
              step={PERCENT_PER_LEVEL}
              formatValue={percent}
              ariaLabel={t('devices.lianli.lightingSpeedAria')}
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
              value={String(strimer.direction)}
              onChange={v => onCommit({ direction: Number(v) })}
              options={directionOptions}
            />
          )}

          {effect && effect.colorsMax > 0 && (
            <div className={styles.colorBlock} data-settings-aside="true">
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
            <div key={i} className={styles.colorBlock} data-settings-aside="true">
              <SettingSelect
                label={t('devices.lianli-wireless.strimerLaneN', { n: i + 1 })}
                value={lane.mode}
                onChange={v => setLane(i, { mode: v }, true)}
                options={laneModes.map(key => ({ value: key, label: effectLabel(t, key) }))}
              />
              <SettingSelect
                label={t('devices.lianli.lightingDirection')}
                value={String(lane.direction)}
                onChange={v => setLane(i, { direction: Number(v) }, true)}
                options={directionOptions}
              />
              <HsvPicker
                value={lane.color}
                onPreview={(hex: string) => setLane(i, { color: hex }, false)}
                onCommit={(hex: string) => setLane(i, { color: hex }, true)}
              />
            </div>
          ))}
        </>
      )}
    </SettingsSection>
  );
}
