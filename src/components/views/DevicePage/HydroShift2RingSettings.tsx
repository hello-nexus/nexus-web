import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { LightingPageSwitch } from './LightingPageSwitch';
import {
  getHydroShift2Lighting,
  setHydroShift2Lighting,
  type HydroShift2Lighting,
  type HydroShift2LightingPatch,
} from '../../../api/hydroshift2';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

type Translate = ReturnType<typeof useTranslation>['t'];

const PERCENT_PER_LEVEL = 25;
// Mode key under which the Lighting page drives the ring.
const LIGHTING_PAGE_MODE = 'canvas';
// The pump head's own palette, used for any colour the user has not set.
const DEFAULT_PALETTE = ['#ff0000', '#0000ff', '#00ff00', '#ffff00'];

function effectLabel(t: Translate, key: string): string {
  return t(`devices.lianliEffect.${key}` as Parameters<Translate>[0]);
}

function fullPalette(colors: string[]): string[] {
  return DEFAULT_PALETTE.map((fallback, i) => colors[i] ?? fallback);
}

interface HydroShift2RingSettingsProps {
  onSectionNavigate?: (section: string) => void;
}

/** The HydroShift II pump ring: follow the Lighting page, or loop one of the pump head's own effects. */
export function HydroShift2RingSettings({ onSectionNavigate }: HydroShift2RingSettingsProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [lighting, setLighting] = useState<HydroShift2Lighting | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const lt = await getHydroShift2Lighting();
    if (aliveRef.current && lt) setLighting(lt);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    return () => { aliveRef.current = false; };
  }, [refresh]);

  const commit = useCallback((patch: HydroShift2LightingPatch) => {
    void setHydroShift2Lighting(patch);
  }, []);

  const loaded = lighting !== null;
  const followsLightingPage = lighting?.mode === LIGHTING_PAGE_MODE;
  const effectKey = lighting ? (followsLightingPage ? lighting.effectMode : lighting.mode) : '';
  const selected = lighting?.modes.find(m => m.key === effectKey) ?? null;
  const palette = fullPalette(lighting?.colors ?? []);
  const disabled = !loaded || followsLightingPage;

  const levelSlider = (
    label: string,
    ariaLabel: string,
    value: number,
    key: 'brightness' | 'speed',
  ) => (
    <SettingSlider
      editable
      trackFill
      label={label}
      value={value * PERCENT_PER_LEVEL}
      min={0}
      max={100}
      step={PERCENT_PER_LEVEL}
      formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
      ariaLabel={ariaLabel}
      disabled={disabled}
      onChange={(v: number, done?: boolean) => {
        if (!lighting) return;
        const level = Math.round(v / PERCENT_PER_LEVEL);
        setLighting({ ...lighting, [key]: level });
        if (done) commit({ [key]: level });
      }}
      onCommit={(v: number) => commit({ [key]: Math.round(v / PERCENT_PER_LEVEL) })}
    />
  );

  return (
    <SettingsSection title={t('devices.lianli.lightingSection')}>
      <LightingPageSwitch
        on={followsLightingPage}
        disabled={!loaded}
        onChange={on => {
          if (!lighting) return;
          const mode = on ? LIGHTING_PAGE_MODE : effectKey;
          setLighting({ ...lighting, mode });
          commit({ mode });
        }}
        onSectionNavigate={onSectionNavigate}
      />

      <SettingSelect
        label={t('devices.lianli.lightingMode')}
        value={effectKey}
        onChange={v => {
          if (!lighting) return;
          setLighting({ ...lighting, mode: v, effectMode: v });
          commit({ mode: v });
        }}
        options={(lighting?.modes ?? []).map(m => ({ value: m.key, label: effectLabel(t, m.key) }))}
        disabled={disabled}
      />

      {selected?.hasBrightness && levelSlider(
        t('devices.lianli.lightingBrightness'),
        t('devices.lianli.lightingBrightnessAria'),
        lighting?.brightness ?? 0,
        'brightness',
      )}

      {selected?.hasSpeed && levelSlider(
        t('devices.lianli.lightingSpeed'),
        t('devices.lianli.lightingSpeedAria'),
        lighting?.speed ?? 0,
        'speed',
      )}

      {selected?.hasDirection && (
        <SettingSelect
          label={t('devices.lianli.lightingDirection')}
          value={String(lighting?.direction ?? 0)}
          onChange={v => {
            if (!lighting) return;
            const direction = Number(v);
            setLighting({ ...lighting, direction });
            commit({ direction });
          }}
          options={[
            { value: '0', label: t('devices.lianli.directionCw') },
            { value: '1', label: t('devices.lianli.directionCcw') },
          ]}
          disabled={disabled}
        />
      )}

      {selected && selected.colors > 0 && loaded && (
        <div className={`${styles.colorBlock} ${followsLightingPage ? styles.rowDisabled : ''}`} data-settings-aside="true">
          <div className={styles.colorPairRow}>
            {palette.slice(0, selected.colors).map((color, i) => (
              <div key={i} className={styles.colorEntry}>
                {selected.colors > 1 && (
                  <span className={styles.colorLabel}>{t('devices.lianli.colorN', { n: i + 1 })}</span>
                )}
                <HsvPicker
                  value={color}
                  onPreview={(hex: string) => {
                    if (!lighting) return;
                    const next = fullPalette(lighting.colors);
                    next[i] = hex;
                    setLighting({ ...lighting, colors: next });
                  }}
                  onCommit={(hex: string) => {
                    if (!lighting) return;
                    const next = fullPalette(lighting.colors);
                    next[i] = hex;
                    setLighting({ ...lighting, colors: next });
                    commit({ colors: next });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
